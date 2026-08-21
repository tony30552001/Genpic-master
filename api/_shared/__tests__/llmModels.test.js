import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const dbPath = require.resolve("../db");
const cryptoPath = require.resolve("../secretCrypto");
const llmPath = require.resolve("../llmModels");

const originalModules = {
  [dbPath]: require.cache[dbPath],
  [cryptoPath]: require.cache[cryptoPath],
  [llmPath]: require.cache[llmPath],
};

const queryCalls = [];
let queryResults = [];

const stubModule = (path, exports) => {
  require.cache[path] = {
    id: path,
    filename: path,
    loaded: true,
    exports,
  };
};

stubModule(dbPath, {
  query: async (text, params) => {
    queryCalls.push({ text, params });
    const next = queryResults.shift();
    if (typeof next === "function") return next();
    return next || { rows: [] };
  },
});
stubModule(cryptoPath, {
  encrypt: (value) => `enc:${value}`,
  decrypt: (value) => String(value).replace(/^enc:/, ""),
});

const {
  LlmConfigurationError,
  createLlmModel,
  deleteLlmModel,
  resolveRoleModel,
  setRoleAssignment,
  validateModelInput,
} = require("../llmModels");

const TENANT = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  queryCalls.length = 0;
  queryResults = [];
});

afterEach(() => {
  expect(queryResults).toHaveLength(0);
});

afterAll(() => {
  for (const [path, mod] of Object.entries(originalModules)) {
    if (mod) {
      require.cache[path] = mod;
    } else {
      delete require.cache[path];
    }
  }
});

describe("llmModels validation", () => {
  it("requires a public https endpoint for Azure OpenAI models", () => {
    expect(() =>
      validateModelInput({
        label: "GPT",
        provider: "azure-openai",
        modelName: "gpt-5.6-luna",
        endpoint: "",
      })
    ).toThrow("Azure OpenAI 模型必須填寫端點");

    expect(() =>
      validateModelInput({
        label: "GPT",
        provider: "azure-openai",
        modelName: "gpt-5.6-luna",
        endpoint: "http://127.0.0.1/openai/v1",
      })
    ).toThrow("端點必須是公開可連線的 https 網址");
  });

  it("drops the endpoint for Gemini models because the SDK owns it", () => {
    expect(
      validateModelInput({
        label: "Flash",
        provider: "google-gemini",
        modelName: "gemini-2.0-flash",
        endpoint: "https://example.com",
      })
    ).toEqual({
      label: "Flash",
      provider: "google-gemini",
      modelName: "gemini-2.0-flash",
      endpoint: "",
    });
  });

  it("rejects unknown providers", () => {
    expect(() =>
      validateModelInput({
        label: "X",
        provider: "openai",
        modelName: "gpt-4",
        endpoint: "",
      })
    ).toThrow("不支援的模型供應商");
  });
});

describe("createLlmModel", () => {
  it("stores the key encrypted and never returns it", async () => {
    queryResults.push({
      rows: [
        {
          id: "model-1",
          label: "GPT 分析",
          provider: "azure-openai",
          model_name: "gpt-5.6-luna",
          endpoint: "https://pixora.openai.azure.com/openai/v1",
          api_key_encrypted: "enc:secret",
          created_at: new Date("2026-01-01T00:00:00Z"),
          updated_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    const model = await createLlmModel({
      tenantId: TENANT,
      label: "GPT 分析",
      provider: "azure-openai",
      modelName: "gpt-5.6-luna",
      endpoint: "https://pixora.openai.azure.com/openai/v1",
      apiKey: "secret",
      createdBy: "user-1",
    });

    expect(queryCalls[0].params).toContain("enc:secret");
    expect(model).toMatchObject({ id: "model-1", hasApiKey: true });
    expect(JSON.stringify(model)).not.toContain("secret");
  });

  it("requires an API key", async () => {
    await expect(
      createLlmModel({
        tenantId: TENANT,
        label: "GPT 分析",
        provider: "azure-openai",
        modelName: "gpt-5.6-luna",
        endpoint: "https://pixora.openai.azure.com/openai/v1",
        apiKey: "",
      })
    ).rejects.toThrow("請填寫 API 金鑰");
  });

  it("maps a duplicate label to a 409", async () => {
    queryResults.push(() => {
      const error = new Error("duplicate key");
      error.code = "23505";
      throw error;
    });

    await expect(
      createLlmModel({
        tenantId: TENANT,
        label: "GPT 分析",
        provider: "azure-openai",
        modelName: "gpt-5.6-luna",
        endpoint: "https://pixora.openai.azure.com/openai/v1",
        apiKey: "secret",
      })
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("deleteLlmModel", () => {
  it("refuses to delete a model that is still assigned", async () => {
    queryResults.push({ rows: [{ role: "document_analysis" }] });

    await expect(
      deleteLlmModel({ tenantId: TENANT, id: "model-1" })
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("文件分鏡"),
    });
  });
});

describe("setRoleAssignment", () => {
  it("rejects a fallback that equals the primary model", async () => {
    await expect(
      setRoleAssignment({
        tenantId: TENANT,
        role: "document_analysis",
        modelId: "model-1",
        fallbackModelId: "model-1",
      })
    ).rejects.toThrow("備援模型必須與主要模型不同");
  });

  it("accepts models from any provider because roles are not pinned", async () => {
    queryResults.push({ rows: [{ id: "model-1" }, { id: "model-2" }] });
    queryResults.push({
      rows: [
        {
          role: "document_analysis",
          model_id: "model-1",
          fallback_model_id: "model-2",
          updated_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    const assignment = await setRoleAssignment({
      tenantId: TENANT,
      role: "document_analysis",
      modelId: "model-1",
      fallbackModelId: "model-2",
    });

    expect(assignment.fallbackModelId).toBe("model-2");
  });

  it("upserts a valid assignment", async () => {
    queryResults.push({
      rows: [{ id: "model-1" }, { id: "model-2" }],
    });
    queryResults.push({
      rows: [
        {
          role: "document_analysis",
          model_id: "model-1",
          fallback_model_id: "model-2",
          updated_at: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    const assignment = await setRoleAssignment({
      tenantId: TENANT,
      role: "document_analysis",
      modelId: "model-1",
      fallbackModelId: "model-2",
      updatedBy: "user-1",
    });

    expect(assignment).toMatchObject({
      role: "document_analysis",
      modelId: "model-1",
      fallbackModelId: "model-2",
    });
  });
});

describe("resolveRoleModel", () => {
  it("decrypts the assigned primary and fallback models across providers", async () => {
    queryResults.push({
      rows: [
        {
          id: "model-1",
          label: "GPT 分析",
          provider: "azure-openai",
          model_name: "gpt-5.6-luna",
          endpoint: "https://pixora.openai.azure.com/openai/v1",
          api_key_encrypted: "enc:primary-key",
          fallback_id: "model-2",
          fallback_label: "Gemini 備援",
          fallback_provider: "google-gemini",
          fallback_model_name: "gemini-2.0-flash",
          fallback_endpoint: null,
          fallback_api_key_encrypted: "enc:peer-key",
        },
      ],
    });

    const resolved = await resolveRoleModel(TENANT, "document_analysis");

    expect(resolved.model.provider).toBe("azure-openai");
    expect(resolved.model.apiKey).toBe("primary-key");
    expect(resolved.fallback.provider).toBe("google-gemini");
    expect(resolved.fallback.modelName).toBe("gemini-2.0-flash");
    expect(resolved.fallback.apiKey).toBe("peer-key");
  });

  it("fails loudly when the role has no assignment", async () => {
    queryResults.push({ rows: [] });

    await expect(resolveRoleModel(TENANT, "style_analysis")).rejects.toBeInstanceOf(
      LlmConfigurationError
    );
  });

  it("reports an unsupported role", async () => {
    await expect(resolveRoleModel(TENANT, "unknown")).rejects.toThrow(
      "不支援的分析用途"
    );
  });
});
