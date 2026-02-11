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

  it("generateImage posts prompt", async () => {
    await generateImage({ prompt: "prompt", aspectRatio: "16:9" });
    expect(apiPost).toHaveBeenCalled();
  });
});
