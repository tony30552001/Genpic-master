import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("../../_shared/admin");
const limiter = require("../../_shared/rateLimit");
const models = require("../../_shared/imageModels");
const policy = require("../../_shared/modelPolicy");
const jobs = require("../../_shared/imageJobs");
const { ImageModelError } = require("../../_shared/imageModelConfig");
admin.requireAdmin = vi.fn();
limiter.rateLimit = vi.fn();
for (const name of ["createImageModel", "updateImageModel", "deleteImageModel", "listImageModels", "listPublicImageModels"]) {
  models[name] = vi.fn();
}
policy.ensureModelPolicy = vi.fn();
policy.updateModelPolicy = vi.fn();
jobs.createImageJob = vi.fn();
const handler = require("../index");
const identity = { tenantId: "tenant-1", userId: "admin-1" };
const model = {
  modelKey: "gpt-image-2.5-flare", label: "Flare", apiType: "azure-openai-images-v1",
  deploymentName: "flare", endpoint: "https://example.openai.azure.com/openai/v1",
  supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"],
  defaultQuality: "medium", hasApiKey: true,
};
const invoke = async (method, resource = "image-models", body, id) => {
  const context = {};
  await handler(context, { method, params: { resource, id }, body, headers: {} });
  return context.res;
};

beforeEach(() => {
  vi.clearAllMocks();
  admin.requireAdmin.mockResolvedValue({ identity });
  limiter.rateLimit.mockReturnValue({ limited: false });
  models.listImageModels.mockResolvedValue([model]);
  models.listPublicImageModels.mockResolvedValue([{
    modelKey: model.modelKey, label: model.label, supportedQualities: model.supportedQualities,
  }]);
  policy.ensureModelPolicy.mockResolvedValue({ allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2" });
});

describe("image model management", () => {
  it("returns catalog metadata, quality options and key availability only", async () => {
    const res = await invoke("GET");
    expect(res.status).toBe(200);
    expect(res.body.models).toEqual([model]);
    expect(res.body.qualities).toContain("max");
    expect(res.body.models[0]).not.toHaveProperty("apiKey");
    expect(models.listImageModels).toHaveBeenCalledWith(identity.tenantId);
  });

  it("creates a tenant-local model without changing policy or generating images", async () => {
    const res = await invoke("POST", "image-models", { ...model, apiKey: "test-key" });
    expect(res.status).toBe(201);
    expect(models.createImageModel).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: identity.tenantId, createdBy: identity.userId, apiKey: "test-key",
    }));
    expect(policy.updateModelPolicy).not.toHaveBeenCalled();
    expect(jobs.createImageJob).not.toHaveBeenCalled();
    expect(JSON.stringify(res.body)).not.toContain("test-key");
  });

  it("updates keys without accepting changes to the route model key", async () => {
    const res = await invoke("PUT", "image-models", { ...model, apiKey: "" }, model.modelKey);
    expect(res.status).toBe(200);
    expect(models.updateImageModel).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: model.modelKey, apiKey: "", tenantId: identity.tenantId, updatedBy: identity.userId,
    }));
    expect((await invoke("PUT", "image-models", { ...model, modelKey: "another" }, model.modelKey)).status).toBe(400);
    expect(models.updateImageModel).toHaveBeenCalledTimes(1);
  });

  it("maps domain conflicts but does not disguise infrastructure errors as invalid input", async () => {
    models.deleteImageModel.mockRejectedValueOnce(new ImageModelError("in use", "conflict", 409));
    expect((await invoke("DELETE", "image-models", undefined, model.modelKey)).status).toBe(409);
    const failure = new Error("database offline");
    models.deleteImageModel.mockRejectedValueOnce(failure);
    await expect(invoke("DELETE", "image-models", undefined, model.modelKey)).rejects.toBe(failure);
  });

  it("queues an explicit low-quality saved-model test without policy mutation", async () => {
    jobs.createImageJob.mockResolvedValue({ id: "job-1", status: "queued", model: model.modelKey });
    const res = await invoke("POST", "image-model-tests", { modelKey: model.modelKey });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: "job-1", status: "queued", model: model.modelKey });
    expect(jobs.createImageJob).toHaveBeenCalledWith(expect.objectContaining({
      ...identity, model: model.modelKey, quality: "low", aspectRatio: "1:1",
    }));
    expect(policy.updateModelPolicy).not.toHaveBeenCalled();
  });

  it("does not accidentally test the default model when the key is missing", async () => {
    expect((await invoke("POST", "image-model-tests", {})).status).toBe(400);
    expect(jobs.createImageJob).not.toHaveBeenCalled();
  });

  it("guards catalog and paid tests with administrator authorization", async () => {
    admin.requireAdmin.mockImplementation(async (context) => {
      context.res = { status: 403 };
      return null;
    });
    expect((await invoke("POST", "image-models", model)).status).toBe(403);
    expect((await invoke("POST", "image-model-tests", { modelKey: model.modelKey })).status).toBe(403);
    expect(models.createImageModel).not.toHaveBeenCalled();
    expect(jobs.createImageJob).not.toHaveBeenCalled();
  });

  it("keeps settings policy separate from registered model metadata", async () => {
    const res = await invoke("GET", "settings");
    expect(res.body.modelPolicy.defaultModel).toBe("gpt-image-2");
    expect(res.body.models[0].modelKey).toBe(model.modelKey);
    expect(res.body).not.toHaveProperty("supportedModels");
  });
});
