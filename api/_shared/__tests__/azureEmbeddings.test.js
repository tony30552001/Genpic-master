import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  INPUT_TYPES,
  embedText,
  resolveEmbeddingsEndpoint,
} = require("../azureEmbeddings");

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

const embeddingOfLength = (length) => Array.from({ length }, () => 0.1);

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(payload),
});

describe("resolveEmbeddingsEndpoint", () => {
  it("completes a resource root into the versioned embeddings route", () => {
    expect(
      resolveEmbeddingsEndpoint("https://example.services.ai.azure.com/models")
    ).toBe(
      "https://example.services.ai.azure.com/models/embeddings?api-version=2024-05-01-preview"
    );
  });

  it("keeps the api-version already present on a copied target URI", () => {
    expect(
      resolveEmbeddingsEndpoint(
        "https://example.services.ai.azure.com/models/embeddings?api-version=2099-01-01"
      )
    ).toBe(
      "https://example.services.ai.azure.com/models/embeddings?api-version=2099-01-01"
    );
  });

  it("rejects missing or malformed configuration", () => {
    expect(() => resolveEmbeddingsEndpoint("")).toThrow(
      "AZURE_EMBEDDING_ENDPOINT 尚未設定"
    );
    expect(() => resolveEmbeddingsEndpoint("not-a-url")).toThrow(
      "AZURE_EMBEDDING_ENDPOINT 不是合法的網址"
    );
  });
});

describe("embedText", () => {
  beforeEach(() => {
    process.env.AZURE_EMBEDDING_ENDPOINT =
      "https://example.services.ai.azure.com/models";
    process.env.AZURE_EMBEDDING_API_KEY = "secret";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("pins the stored vector width and the asymmetric input type", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ embedding: embeddingOfLength(1536) }] })
      );

    const values = await embedText({
      text: "水彩風格",
      inputType: INPUT_TYPES.QUERY,
    });

    expect(values).toHaveLength(1536);

    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toContain("/models/embeddings");
    expect(init.headers["api-key"]).toBe("secret");
    expect(JSON.parse(init.body)).toEqual({
      input: ["水彩風格"],
      model: "embed-v-4-0",
      dimensions: 1536,
      input_type: "query",
    });
  });

  it("rejects a vector that does not match the styles column", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ data: [{ embedding: embeddingOfLength(768) }] })
      );

    await expect(
      embedText({ text: "水彩風格", inputType: INPUT_TYPES.DOCUMENT })
    ).rejects.toThrow("Embedding 維度不符：預期 1536，實際 768");
  });

  it("surfaces the upstream message instead of a silent empty vector", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ error: { message: "Deployment not found" } }, 404)
      );

    await expect(
      embedText({ text: "水彩風格", inputType: INPUT_TYPES.DOCUMENT })
    ).rejects.toThrow("Deployment not found (404)");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries throttling before giving up", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "Too many requests" }, 429))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ embedding: embeddingOfLength(1536) }] })
      );
    vi.spyOn(global, "setTimeout").mockImplementation((callback) => {
      callback();
      return 0;
    });

    const values = await embedText({
      text: "水彩風格",
      inputType: INPUT_TYPES.DOCUMENT,
    });

    expect(values).toHaveLength(1536);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("requires credentials before calling out", async () => {
    delete process.env.AZURE_EMBEDDING_API_KEY;
    global.fetch = vi.fn();

    await expect(
      embedText({ text: "水彩風格", inputType: INPUT_TYPES.QUERY })
    ).rejects.toThrow("AZURE_EMBEDDING_API_KEY 尚未設定");
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
