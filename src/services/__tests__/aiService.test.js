import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiPost: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { apiPost } from "../apiClient";
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

  it("routes every image generation through the backend policy gateway", async () => {
    const result = await generateImage({ prompt: "a red fox", aspectRatio: "1:1", model: "gpt-image-2" });
    expect(apiPost).toHaveBeenCalledWith(
      "/api/generate-images",
      {
        prompt: "a red fox",
        aspectRatio: "1:1",
        imageSize: undefined,
        imageUrl: undefined,
        model: "gpt-image-2",
      },
      { signal: undefined }
    );
    expect(result).toEqual({ ok: true });
  });

  it("generateImage uses apiPost for unknown model", async () => {
    await generateImage({ prompt: "prompt", aspectRatio: "16:9", model: "dall-e-3" });
    expect(apiPost).toHaveBeenCalled();
  });
});
