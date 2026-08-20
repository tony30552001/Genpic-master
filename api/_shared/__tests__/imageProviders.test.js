import { afterEach, describe, expect, it } from "vitest";

import { isImageModelConfigured, renderImage } from "../imageProviders";

describe("isImageModelConfigured", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("requires both GPT Image credentials before the deck worker calls it", () => {
    process.env.GPT_IMAGE_ENDPOINT = "https://example.com";
    delete process.env.GPT_IMAGE_API_KEY;
    expect(isImageModelConfigured("gpt-image-2")).toBe(false);

    process.env.GPT_IMAGE_API_KEY = "secret";
    expect(isImageModelConfigured("gpt-image-2")).toBe(true);
  });

  it("requires the Google key for Gemini", () => {
    delete process.env.GOOGLE_API_KEY;
    expect(isImageModelConfigured("gemini-imagen")).toBe(false);

    process.env.GOOGLE_API_KEY = "secret";
    expect(isImageModelConfigured("gemini-imagen")).toBe(true);
  });

  it("treats an unknown model as unusable", () => {
    process.env.GOOGLE_API_KEY = "secret";
    process.env.GPT_IMAGE_ENDPOINT = "https://example.com";
    process.env.GPT_IMAGE_API_KEY = "secret";
    expect(isImageModelConfigured("dall-e-2")).toBe(false);
    expect(isImageModelConfigured(undefined)).toBe(false);
  });
});

describe("renderImage", () => {
  it("rejects a model it has no renderer for", async () => {
    await expect(renderImage({ model: "dall-e-2", prompt: "x" })).rejects.toThrow(
      "不支援的圖片生成模型：dall-e-2"
    );
  });
});
