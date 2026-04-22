import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiPost: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("../gptImageService", () => ({
  generateImageGpt: vi.fn(() => Promise.resolve({ imageUrl: "data:image/png;base64,FAKE" })),
}));

import { apiPost } from "../apiClient";
import { generateImageGpt } from "../gptImageService";
import { analyzeStyle, generateImage } from "../aiService";

describe("aiService", () => {
  it("analyzeStyle posts reference image", async () => {
    await analyzeStyle({ referencePreview: "data:image/png;base64,AAA" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("generateImage posts prompt (no model)", async () => {
    await generateImage({ prompt: "prompt", aspectRatio: "16:9" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("generateImage routes to gptImageService when model is gpt-image-2", async () => {
    const result = await generateImage({ prompt: "a red fox", aspectRatio: "1:1", model: "gpt-image-2" });
    expect(generateImageGpt).toHaveBeenCalledWith({ prompt: "a red fox", aspectRatio: "1:1" });
    expect(result).toEqual({ imageUrl: "data:image/png;base64,FAKE" });
  });

  it("generateImage uses apiPost for unknown model", async () => {
    await generateImage({ prompt: "prompt", aspectRatio: "16:9", model: "dall-e-3" });
    expect(apiPost).toHaveBeenCalled();
  });
});
