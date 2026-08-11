import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve({ ok: true })),
}));

import { apiGet, apiPost } from "../apiClient";
import {
  analyzeDocument,
  analyzeStyle,
  generateImage,
  waitForImageJob,
} from "../aiService";

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

  it("sends document metadata to the analysis endpoint", async () => {
    await analyzeDocument({
      documentUrl: "https://storage.example/report.docx",
      fileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sceneCount: 6,
      mode: "presentation",
    });

    expect(apiPost).toHaveBeenCalledWith("/api/analyze-document", {
      documentUrl: "https://storage.example/report.docx",
      fileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64Content: undefined,
      sceneCount: 6,
      mode: "presentation",
    });
  });

  it("waits for queued image jobs until the result is ready", async () => {
    apiGet
      .mockResolvedValueOnce({ status: "queued", jobId: "job-1" })
      .mockResolvedValueOnce({
        status: "succeeded",
        jobId: "job-1",
        imageUrl: "data:image/png;base64,AAA",
      });

    const result = await waitForImageJob({
      jobId: "job-1",
      pollIntervalMs: 0,
    });

    expect(result.imageUrl).toBe("data:image/png;base64,AAA");
    expect(apiGet).toHaveBeenCalledWith("/api/image-jobs/job-1", {
      signal: undefined,
    });
  });
});
