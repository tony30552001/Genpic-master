import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve({ ok: true })),
  apiPostBlob: vi.fn(() => Promise.resolve(new Blob(["pptx"]))),
  apiGetBlob: vi.fn(() => Promise.resolve(new Blob(["pptx"]))),
}));

import { apiGet, apiPost, apiPostBlob } from "../apiClient";
import {
  analyzeDocument,
  analyzeStyle,
  generateImage,
  generatePresentationPptx,
  waitForDeckJob,
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
      slideCount: 6,
      mode: "presentation",
    });

    expect(apiPost).toHaveBeenCalledWith("/api/analyze-document", {
      documentUrl: "https://storage.example/report.docx",
      fileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64Content: undefined,
      sceneCount: undefined,
      slideCount: 6,
      mode: "presentation",
    });
  });

  it("requests a server-generated presentation as a blob", async () => {
    const slides = [{ title: "Overview", slide_type: "cover" }];

    await generatePresentationPptx({ slides, signal: "abort-signal" });

    expect(apiPostBlob).toHaveBeenCalledWith(
      "/api/generate-presentation",
      { slides },
      { signal: "abort-signal" }
    );
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

  it("keeps watching a deck job through transient poll failures", async () => {
    apiGet.mockReset();
    apiGet
      .mockRejectedValueOnce(new Error("網路請求失敗: Failed to fetch"))
      .mockResolvedValueOnce({
        status: "processing",
        jobId: "deck-1",
        phase: "逐頁設計版面",
        progress: { current: 2, total: 8 },
      })
      .mockResolvedValueOnce({
        status: "succeeded",
        jobId: "deck-1",
        deckTitle: "AI 導入策略",
        fileName: "AI 導入策略.pptx",
        slideCount: 8,
        progress: { current: 8, total: 8 },
      });

    const phases = [];
    const job = await waitForDeckJob({
      jobId: "deck-1",
      pollIntervalMs: 0,
      onProgress: (update) => phases.push(update.phase),
    });

    expect(job.deckTitle).toBe("AI 導入策略");
    expect(phases).toEqual(["逐頁設計版面", undefined]);
    expect(apiGet).toHaveBeenCalledTimes(3);
  });

  it("stops watching a deck job that no longer exists", async () => {
    apiGet.mockReset();
    const missing = new Error("找不到簡報生成工作");
    missing.status = 404;
    apiGet.mockRejectedValueOnce(missing);

    await expect(
      waitForDeckJob({ jobId: "deck-missing", pollIntervalMs: 0 })
    ).rejects.toMatchObject({ status: 404 });
    expect(apiGet).toHaveBeenCalledTimes(1);
  });

  it("gives up after repeated deck poll failures", async () => {
    apiGet.mockReset();
    apiGet.mockRejectedValue(new Error("網路請求失敗: Failed to fetch"));

    await expect(
      waitForDeckJob({ jobId: "deck-1", pollIntervalMs: 0 })
    ).rejects.toThrow("網路請求失敗");
    expect(apiGet).toHaveBeenCalledTimes(5);
  });
});
