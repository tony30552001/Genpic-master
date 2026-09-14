import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const crypto = require("../secretCrypto");
db.query = vi.fn();
db.getPool = vi.fn();
crypto.encrypt = vi.fn((key) => `encrypted:${key}`);
crypto.decrypt = vi.fn((value) => value.replace("encrypted:", ""));

const {
  createImageModel, deleteImageModel, listImageModels, listPublicImageModels,
  resolveImageModel, updateImageModel, validateImageModelInput, withImageModelTransaction,
} = require("../imageModels");
const { normalizeImageEndpoint, validateImageQuality, IMAGE_QUALITIES } = require("../imageModelConfig");
const { updateModelPolicy, validateModelPolicy } = require("../modelPolicy");

const TENANT = "11111111-1111-4111-8111-111111111111";
const input = {
  modelKey: "gpt-image-2.5-flare",
  label: "GPT Image 2.5 Flare",
  apiType: "azure-openai-images-v1",
  deploymentName: "flare-deployment",
  endpoint: "https://example.openai.azure.com/openai/v1",
  supportedQualities: [...IMAGE_QUALITIES],
  defaultQuality: "medium",
};
const row = {
  model_key: input.modelKey, label: input.label, api_type: input.apiType,
  deployment_name: input.deploymentName, endpoint: input.endpoint,
  supported_qualities: input.supportedQualities, default_quality: "medium",
  has_api_key: true, api_key_encrypted: "encrypted:test-key",
};
let client;
let results;

beforeEach(() => {
  vi.clearAllMocks();
  results = [];
  client = {
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
      if (sql === "SELECT id FROM tenants WHERE id = $1 FOR UPDATE") {
        return { rows: [{ id: TENANT }] };
      }
      if (!results.length) throw new Error(`Unexpected query: ${sql}`);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result;
    }),
  };
  db.getPool.mockReturnValue({ connect: async () => client });
});

describe("Azure image configuration", () => {
  it.each([
    "https://example.openai.azure.com",
    "https://example.openai.azure.com/openai/v1/",
    "https://example.openai.azure.com/openai/v1/images/generations",
  ])("normalizes supported endpoint input %s", (endpoint) => {
    expect(normalizeImageEndpoint(endpoint)).toBe(input.endpoint);
  });

  it.each([
    "http://example.openai.azure.com/openai/v1",
    "https://127.0.0.1/openai/v1",
    "https://169.254.169.254/openai/v1",
    "https://example.openai.azure.com.attacker.test/openai/v1",
    "https://user:password@example.openai.azure.com/openai/v1",
    "https://example.openai.azure.com/openai/v1?api-key=secret",
    "https://example.openai.azure.com/openai/v1#secret",
    "https://example.openai.azure.com:8443/openai/v1",
    "https://example.openai.azure.com/openai/deployments/old/images/generations",
    "",
  ])("rejects unsupported or unsafe endpoint %s", (endpoint) => {
    expect(() => normalizeImageEndpoint(endpoint)).toThrow();
  });

  it("accepts future deployment names without a fixed model whitelist", () => {
    expect(validateImageModelInput({
      ...input, modelKey: "team-image-next", deploymentName: "team-custom-alias",
    })).toMatchObject({ modelKey: "team-image-next", deploymentName: "team-custom-alias" });
  });

  it.each(["xhigh", "max", "auto"])("accepts Flare %s but not the GPT Image 2 profile", (quality) => {
    expect(validateImageQuality(input, quality)).toBe(quality);
    expect(() => validateImageQuality({
      ...input, supportedQualities: ["low", "medium", "high"],
    }, quality)).toThrow();
  });

  it.each([null, "", "HIGH", " max ", 0, [], {}])("rejects explicit invalid quality %j", (quality) => {
    expect(() => validateImageQuality(input, quality)).toThrow();
  });

  it("uses only omission as the default quality", () => {
    expect(validateImageQuality({ ...input, defaultQuality: "high" }, undefined)).toBe("high");
  });

  it("rejects empty capabilities and defaults outside capabilities", () => {
    expect(() => validateImageModelInput({ ...input, supportedQualities: [] })).toThrow();
    expect(() => validateImageModelInput({ ...input, defaultQuality: "ultra" })).toThrow();
  });
});

describe("encrypted tenant catalog", () => {
  it("creates an encrypted model without changing tenant policy", async () => {
    results.push({ rows: [row] });
    const created = await createImageModel({ ...input, tenantId: TENANT, apiKey: "test-key" });
    expect(created).toMatchObject({ modelKey: input.modelKey, hasApiKey: true });
    expect(JSON.stringify(created)).not.toContain("test-key");
    expect(created).not.toHaveProperty("api_key_encrypted");
    const insert = client.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO image_models"));
    expect(insert[1]).toContain("encrypted:test-key");
    expect(insert[1]).not.toContain("test-key");
    expect(client.query.mock.calls.some(([sql]) => sql.includes("tenant_model_settings"))).toBe(false);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("never selects secrets for catalog listing and public projection", async () => {
    db.query.mockResolvedValue({ rows: [row] });
    const models = await listImageModels(TENANT);
    const publicModels = await listPublicImageModels(TENANT);
    expect(models[0]).toMatchObject({ hasApiKey: true, deploymentName: input.deploymentName });
    expect(publicModels[0]).toEqual({
      modelKey: input.modelKey, label: input.label, apiType: input.apiType,
      supportedQualities: input.supportedQualities, defaultQuality: "medium",
    });
    expect(db.query.mock.calls[1][0]).not.toMatch(/endpoint|api_key/);
    expect(JSON.stringify([models, publicModels])).not.toContain("test-key");
    expect(crypto.decrypt).not.toHaveBeenCalled();
  });

  it("resolves by tenant and immutable model key, not process environment", async () => {
    db.query.mockResolvedValue({ rows: [row] });
    const config = await resolveImageModel({ tenantId: TENANT, modelKey: input.modelKey });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("tenant_id = $1 AND model_key = $2"), [
      TENANT, input.modelKey,
    ]);
    expect(config).toMatchObject({ apiKey: "test-key", deploymentName: "flare-deployment" });
  });

  it("surfaces absent or foreign models rather than using another deployment", async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(resolveImageModel({ tenantId: TENANT, modelKey: input.modelKey }))
      .rejects.toMatchObject({ code: "image_model_not_configured", status: 503, retryable: false });
    await expect(resolveImageModel({ tenantId: TENANT, modelKey: null }))
      .rejects.toMatchObject({ status: 503 });
  });

  it("does not expose decrypt errors or secrets", async () => {
    db.query.mockResolvedValue({ rows: [row] });
    crypto.decrypt.mockImplementationOnce(() => { throw new Error("secret diagnostic"); });
    await expect(resolveImageModel({ tenantId: TENANT, modelKey: input.modelKey }))
      .rejects.toMatchObject({ code: "image_model_not_configured", message: expect.not.stringContaining("secret diagnostic") });
  });

  it("retains a key on blank update and permits metadata updates during work", async () => {
    results.push({ rows: [row] }, { rows: [{ ...row, label: "Renamed" }] });
    await updateImageModel({ ...input, label: "Renamed", apiKey: "", tenantId: TENANT });
    const update = client.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE image_models"));
    expect(update[1][6]).toBeNull();
    expect(crypto.encrypt).not.toHaveBeenCalled();
    expect(client.query.mock.calls.some(([sql]) => sql.includes("image_generation_jobs"))).toBe(false);
  });

  it("replaces the key only through encryption", async () => {
    results.push({ rows: [row] }, { rows: [row] });
    await updateImageModel({ ...input, apiKey: "replacement-key", tenantId: TENANT });
    const update = client.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE image_models"));
    expect(update[1][6]).toBe("encrypted:replacement-key");
  });

  it("rejects changes to deployment identity", async () => {
    results.push({ rows: [row] });
    await expect(updateImageModel({ ...input, deploymentName: "another", tenantId: TENANT }))
      .rejects.toMatchObject({ status: 400 });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
  });

  it("blocks runtime changes with an active image or deck job", async () => {
    results.push({ rows: [row] }, { rows: [{ id: "active-job" }] });
    await expect(updateImageModel({
      ...input, endpoint: "https://other.openai.azure.com", tenantId: TENANT,
    })).rejects.toMatchObject({ status: 409 });
    const active = client.query.mock.calls.find(([sql]) => sql.includes("UNION ALL"));
    expect(active[0]).toContain("image_model_key = $2");
    expect(active[1]).toEqual([TENANT, input.modelKey]);
  });

  it("blocks deleting policy-referenced models", async () => {
    results.push({ rows: [{ tenant_id: TENANT }] });
    await expect(deleteImageModel({ tenantId: TENANT, modelKey: input.modelKey }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("blocks deleting a model still referenced by a job", async () => {
    results.push({ rows: [] }, { rows: [{ id: "active-job" }] });
    await expect(deleteImageModel({ tenantId: TENANT, modelKey: input.modelKey }))
      .rejects.toMatchObject({ status: 409 });
  });

  it("deletes unused models only within their tenant", async () => {
    results.push({ rows: [] }, { rows: [] }, { rows: [{ model_key: input.modelKey }] });
    await deleteImageModel({ tenantId: TENANT, modelKey: input.modelKey });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM image_models WHERE tenant_id = $1 AND model_key = $2"),
      [TENANT, input.modelKey]
    );
  });

  it("maps duplicate names to conflicts and releases the transaction", async () => {
    results.push(Object.assign(new Error("duplicate"), { code: "23505" }));
    await expect(createImageModel({ ...input, tenantId: TENANT, apiKey: "test-key" }))
      .rejects.toMatchObject({ status: 409 });
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("propagates infrastructure failures instead of producing empty catalogs", async () => {
    const failure = new Error("database offline");
    await expect(withImageModelTransaction(TENANT, async () => { throw failure; })).rejects.toBe(failure);
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});

describe("catalog-backed policy", () => {
  const models = [{ modelKey: "gpt-image-2" }, { modelKey: input.modelKey }];
  it("accepts any registered tenant model and keeps an explicitly selected default", () => {
    expect(validateModelPolicy({
      models, allowedModels: ["gpt-image-2", input.modelKey], defaultModel: "gpt-image-2",
    })).toEqual({ allowedModels: ["gpt-image-2", input.modelKey], defaultModel: "gpt-image-2" });
  });
  it("rejects foreign/unregistered or disallowed defaults", () => {
    expect(() => validateModelPolicy({ models, allowedModels: ["foreign"], defaultModel: "foreign" })).toThrow();
    expect(() => validateModelPolicy({ models, allowedModels: ["gpt-image-2"], defaultModel: input.modelKey })).toThrow();
  });
  it("updates policy under the same tenant admission lock", async () => {
    const policy = { allowed_models: ["gpt-image-2"], default_model: "gpt-image-2" };
    results.push(
      { rows: [] }, { rows: [policy] }, { rows: [row] },
      { rows: [{ allowed_models: [input.modelKey], default_model: input.modelKey }] }
    );
    const saved = await updateModelPolicy({
      tenantId: TENANT, allowedModels: [input.modelKey], defaultModel: input.modelKey,
    });
    expect(saved.defaultModel).toBe(input.modelKey);
    expect(client.query.mock.calls[1][0]).toContain("FOR UPDATE");
    expect(client.query).toHaveBeenCalledWith("COMMIT");
  });
});
