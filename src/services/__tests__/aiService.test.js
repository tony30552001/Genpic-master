import { describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(() => Promise.resolve({ ok: true })),
  apiGetBlob: vi.fn(() => Promise.resolve(new Blob(["pptx"]))),
}));

import { apiGet, apiPost } from "../apiClient";
import {
  analyzeDocument,
  analyzeStyle,
  createDeckJob,
  generateImage,
  transformImage,
  waitForDeckJob,
  waitForImageJob,
} from "../aiService";

describe("aiService", () => {
  it("analyzeStyle posts an owner-scoped reference upload ID without a URL", async () => {
    await analyzeStyle({ referenceUploadId: "123e4567-e89b-42d3-a456-426614174000" });
    expect(apiPost).toHaveBeenCalledWith(
      "/api/analyze-style",
      { referenceUploadId: "123e4567-e89b-42d3-a456-426614174000" }
    );
    expect(apiPost.mock.calls.at(-1)[1]).not.toHaveProperty("imageUrl");
  });

  it("generateImage posts the creative inputs, not an assembled prompt", async () => {
    await generateImage({ userScript: "prompt", aspectRatio: "16:9" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("routes every image generation through the backend policy gateway", async () => {
    const result = await generateImage({
      userScript: "a red fox",
      stylePrompt: "watercolor",
      styleTags: ["柔和"],
      purpose: "storyboard",
      imageLanguage: "zh-TW",
      aspectRatio: "1:1",
    });
    expect(apiPost).toHaveBeenCalledWith(
      "/api/generate-images",
      {
        userScript: "a red fox",
        stylePrompt: "watercolor",
        styleTags: ["柔和"],
        purpose: "storyboard",
        imageLanguage: "zh-TW",
        aspectRatio: "1:1",
        imageSize: undefined,
        quality: undefined,
        referenceUploadId: undefined,
      },
      { signal: undefined }
    );
    expect(result).toEqual({ ok: true });
  });

  it("sends an upload ID and no caller-selected document URL to document analysis", async () => {
    await analyzeDocument({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      fileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sceneCount: 6,
    });

    expect(apiPost).toHaveBeenCalledWith("/api/analyze-document", {
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      fileName: "report.docx",
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      base64Content: undefined,
      sceneCount: 6,
    });
  });

  it("generateImage sends a reference upload ID instead of a reference URL", async () => {
    await generateImage({
      userScript: "use the reference",
      referenceUploadId: "123e4567-e89b-42d3-a456-426614174000",
    });

    expect(apiPost.mock.calls.at(-1)).toEqual([
      "/api/generate-images",
      expect.objectContaining({
        userScript: "use the reference",
        referenceUploadId: "123e4567-e89b-42d3-a456-426614174000",
      }),
      { signal: undefined },
    ]);
    expect(apiPost.mock.calls.at(-1)[1]).not.toHaveProperty("imageUrl");
  });

  it("transformImage sends only an owned upload ID, never browser image bytes or URL", async () => {
    await transformImage({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      mimeType: "image/png",
      mode: "style_transfer",
      prompt: "watercolor",
    });

    expect(apiPost.mock.calls.at(-1)).toEqual([
      "/api/image-transform",
      expect.objectContaining({
        uploadId: "123e4567-e89b-42d3-a456-426614174000",
        mimeType: "image/png",
      }),
      { signal: undefined },
    ]);
    expect(apiPost.mock.calls.at(-1)[1]).not.toHaveProperty("imageUrl");
    expect(apiPost.mock.calls.at(-1)[1]).not.toHaveProperty("imageBase64");
  });

  it("sends a source upload ID and never a caller-selected document URL for deck jobs", async () => {
    await createDeckJob({
      topic: null,
      sourceUploadId: "123e4567-e89b-42d3-a456-426614174000",
      fileName: "brief.pdf",
      slideCount: 8,
      imageDensity: "every",
      styleId: null,
      layoutId: null,
    });

    expect(apiPost).toHaveBeenCalledWith(
      "/api/deck-jobs",
      {
        topic: null,
        sourceUploadId: "123e4567-e89b-42d3-a456-426614174000",
        fileName: "brief.pdf",
        slideCount: 8,
        imageDensity: "every",
        styleId: null,
        layoutId: null,
      },
      { signal: undefined }
    );
    expect(apiPost.mock.calls.at(-1)[1]).not.toHaveProperty("documentUrl");
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
