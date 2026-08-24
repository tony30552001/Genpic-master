import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("../../services/aiService", () => ({
  createDeckJob: vi.fn(),
  downloadDeckJobPptx: vi.fn(),
  getDeckJob: vi.fn(),
  getDeckSlidePreview: vi.fn(),
  listPptTemplates: vi.fn(() => Promise.resolve({ styles: [], layouts: [] })),
  waitForDeckJob: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({
  uploadFile: vi.fn(),
  uploadFileToBlob: vi.fn(),
}));

import {
  createDeckJob,
  getDeckJob,
  getDeckSlidePreview,
  waitForDeckJob,
} from "../../services/aiService";
import { uploadFile } from "../../services/storageService";
import usePptMasterDeck from "../usePptMasterDeck";

const STORAGE_KEY = "genpic_deck_job";

describe("usePptMasterDeck", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("resumes a running job that was started before the component unmounted", async () => {
    localStorage.setItem(STORAGE_KEY, "deck-1");
    getDeckJob.mockResolvedValue({
      jobId: "deck-1",
      status: "processing",
      phase: "逐頁設計版面",
      slideCount: 8,
      progress: { current: 3, total: 8 },
      startedAt: "2026-08-13T05:00:00.000Z",
    });
    waitForDeckJob.mockResolvedValue({
      jobId: "deck-1",
      status: "succeeded",
      deckTitle: "AI 導入策略",
      fileName: "AI 導入策略.pptx",
      slideCount: 8,
      progress: { current: 8, total: 8 },
    });

    const { result } = renderHook(() => usePptMasterDeck());

    expect(result.current.isGenerating).toBe(true);
    await waitFor(() => expect(result.current.deck?.title).toBe("AI 導入策略"));
    expect(waitForDeckJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "deck-1" })
    );
    expect(result.current.error).toBeNull();
  });

  it("restores a finished job so the download stays available after a reload", async () => {
    localStorage.setItem(STORAGE_KEY, "deck-2");
    getDeckJob.mockResolvedValue({
      jobId: "deck-2",
      status: "succeeded",
      deckTitle: "季度營運檢討",
      fileName: "季度營運檢討.pptx",
      slideCount: 10,
    });

    const { result } = renderHook(() => usePptMasterDeck());

    await waitFor(() => expect(result.current.deck?.jobId).toBe("deck-2"));
    expect(result.current.isGenerating).toBe(false);
    expect(waitForDeckJob).not.toHaveBeenCalled();
  });

  it("drops a stored job id that the server no longer knows", async () => {
    localStorage.setItem(STORAGE_KEY, "deck-gone");
    const missing = new Error("找不到簡報生成工作");
    missing.status = 404;
    getDeckJob.mockRejectedValue(missing);

    const { result } = renderHook(() => usePptMasterDeck());

    await waitFor(() => expect(result.current.isGenerating).toBe(false));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("stores the job id as soon as generation starts", async () => {
    createDeckJob.mockResolvedValue({ jobId: "deck-3", status: "queued" });    waitForDeckJob.mockImplementation(async () => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe("deck-3");
      return {
        jobId: "deck-3",
        status: "succeeded",
        deckTitle: "產品發表",
        fileName: "產品發表.pptx",
        slideCount: 6,
        progress: { current: 6, total: 6 },
      };
    });

    const { result } = renderHook(() => usePptMasterDeck());
    await result.current.generate({ topic: "生成式 AI 導入策略", slideCount: 6 });

    await waitFor(() => expect(result.current.deck?.jobId).toBe("deck-3"));
    expect(localStorage.getItem(STORAGE_KEY)).toBe("deck-3");
  });

  it("forwards the image density to the job endpoint", async () => {
    createDeckJob.mockResolvedValue({ jobId: "deck-4", status: "queued" });
    waitForDeckJob.mockResolvedValue({
      jobId: "deck-4",
      status: "succeeded",
      deckTitle: "產品發表",
      fileName: "產品發表.pptx",
      slideCount: 6,
      progress: { current: 6, total: 6 },
    });

    const { result } = renderHook(() => usePptMasterDeck());
    await result.current.generate({
      topic: "生成式 AI 導入策略",
      slideCount: 6,
      imageDensity: "every",
    });

    expect(createDeckJob).toHaveBeenCalledWith(
      expect.objectContaining({ imageDensity: "every" })
    );
  });

  it("uploads document sources by owner-scoped upload ID instead of a Blob URL", async () => {
    const file = new File(["source"], "brief.pdf", { type: "application/pdf" });
    uploadFile.mockResolvedValue({ uploadId: "upload-doc-1", status: "ready" });
    createDeckJob.mockResolvedValue({ jobId: "deck-upload-1", status: "queued" });
    waitForDeckJob.mockResolvedValue({
      jobId: "deck-upload-1",
      status: "succeeded",
      deckTitle: "參考文件簡報",
      fileName: "參考文件簡報.pptx",
      slideCount: 6,
      progress: { current: 6, total: 6 },
    });

    const { result } = renderHook(() => usePptMasterDeck());
    await result.current.generate({
      file,
      slideCount: 6,
      imageDensity: "every",
    });

    expect(uploadFile).toHaveBeenCalledWith(file, "document");
    expect(createDeckJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUploadId: "upload-doc-1",
        fileName: "brief.pdf",
      })
    );
    expect(createDeckJob.mock.calls[0][0]).not.toHaveProperty("documentUrl");
  });

  it("keeps the job id when only the polling connection broke", async () => {
    localStorage.setItem(STORAGE_KEY, "deck-5");
    getDeckJob.mockResolvedValue({
      jobId: "deck-5",
      status: "processing",
      phase: "逐頁設計版面",
      slideCount: 8,
      progress: { current: 4, total: 8 },
    });
    waitForDeckJob.mockRejectedValue(new Error("網路請求失敗: Failed to fetch"));

    const { result } = renderHook(() => usePptMasterDeck());

    await waitFor(() => expect(result.current.error).toContain("網路請求失敗"));
    expect(result.current.error).toContain("回到此頁會自動接續");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("deck-5");
  });

  it("clears the job id when the server reports the job itself failed", async () => {
    localStorage.setItem(STORAGE_KEY, "deck-6");
    getDeckJob.mockResolvedValue({
      jobId: "deck-6",
      status: "processing",
      slideCount: 8,
      progress: { current: 1, total: 8 },
    });
    const failure = new Error("版面品質檢查未通過");
    failure.jobFailed = true;
    waitForDeckJob.mockRejectedValue(failure);

    const { result } = renderHook(() => usePptMasterDeck());

    await waitFor(() => expect(result.current.error).toBe("版面品質檢查未通過"));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("stops tracking without leaving a stale job id behind", async () => {    localStorage.setItem(STORAGE_KEY, "deck-4");
    getDeckJob.mockResolvedValue({
      jobId: "deck-4",
      status: "queued",
      slideCount: 8,
      progress: { current: 0, total: 8 },
    });
    waitForDeckJob.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => usePptMasterDeck());
    await waitFor(() => expect(waitForDeckJob).toHaveBeenCalled());

    result.current.stopWatching();

    await waitFor(() => expect(result.current.isGenerating).toBe(false));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  describe("slide previews", () => {
    let created;
    let revoked;

    beforeEach(() => {
      created = 0;
      revoked = [];
      URL.createObjectURL = vi.fn(() => `blob:preview-${(created += 1)}`);
      URL.revokeObjectURL = vi.fn((url) => revoked.push(url));
    });

    /** 讓輪詢在測試中可控：每次回傳一份 job 快照。 */
    const watchWithSnapshots = (snapshots) =>
      waitForDeckJob.mockImplementation(async ({ onProgress }) => {
        for (const snapshot of snapshots) onProgress?.(snapshot);
        return snapshots.at(-1);
      });

    const runningJob = (slides) => ({
      jobId: "deck-preview",
      status: "processing",
      slideCount: 4,
      progress: { current: slides.length, total: 4 },
      events: [],
      slides,
    });

    it("fetches each authored slide once and keeps its object URL", async () => {
      localStorage.setItem(STORAGE_KEY, "deck-preview");
      getDeckJob.mockResolvedValue(runningJob([]));
      getDeckSlidePreview.mockResolvedValue(new Blob(["<svg/>"]));
      watchWithSnapshots([
        runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]),
        runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]),
        {
          ...runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]),
          status: "succeeded",
          deckTitle: "AI 導入策略",
        },
      ]);

      const { result } = renderHook(() => usePptMasterDeck());

      await waitFor(() =>
        expect(result.current.slidePreviews[1]?.url).toBe("blob:preview-1")
      );
      expect(getDeckSlidePreview).toHaveBeenCalledTimes(1);
      expect(getDeckSlidePreview).toHaveBeenCalledWith({
        jobId: "deck-preview",
        slideNumber: 1,
      });
    });

    it("refetches and releases the old preview when a slide is repaired", async () => {
      localStorage.setItem(STORAGE_KEY, "deck-preview");
      getDeckJob.mockResolvedValue(runningJob([]));
      getDeckSlidePreview.mockResolvedValue(new Blob(["<svg/>"]));

      let emit = null;
      waitForDeckJob.mockImplementation(
        ({ onProgress }) =>
          new Promise(() => {
            emit = onProgress;
          })
      );

      const { result } = renderHook(() => usePptMasterDeck());
      await waitFor(() => expect(emit).not.toBeNull());

      act(() => emit(runningJob([{ slideNumber: 1, revision: 1, title: "封面" }])));
      await waitFor(() =>
        expect(result.current.slidePreviews[1]?.url).toBe("blob:preview-1")
      );

      act(() => emit(runningJob([{ slideNumber: 1, revision: 2, title: "封面" }])));
      await waitFor(() =>
        expect(result.current.slidePreviews[1]?.url).toBe("blob:preview-2")
      );
      expect(getDeckSlidePreview).toHaveBeenCalledTimes(2);
      expect(revoked).toContain("blob:preview-1");
    });

    it("keeps previews after a failure and releases them on reset", async () => {
      localStorage.setItem(STORAGE_KEY, "deck-preview");
      getDeckJob.mockResolvedValue(runningJob([]));
      getDeckSlidePreview.mockResolvedValue(new Blob(["<svg/>"]));
      const failure = new Error("版面品質檢查未通過");
      failure.jobFailed = true;
      waitForDeckJob.mockImplementation(async ({ onProgress }) => {
        onProgress?.(runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]));
        throw failure;
      });

      const { result } = renderHook(() => usePptMasterDeck());

      await waitFor(() => expect(result.current.error).toBe("版面品質檢查未通過"));
      expect(result.current.slidePreviews[1]?.url).toBe("blob:preview-1");

      result.current.reset();

      await waitFor(() => expect(result.current.slidePreviews).toEqual({}));
      expect(revoked).toContain("blob:preview-1");
    });

    it("leaves the slide without a preview when the request fails", async () => {
      localStorage.setItem(STORAGE_KEY, "deck-preview");
      getDeckJob.mockResolvedValue(runningJob([]));
      getDeckSlidePreview.mockRejectedValue(new Error("網路請求失敗"));
      watchWithSnapshots([
        runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]),
        {
          ...runningJob([{ slideNumber: 1, revision: 1, title: "封面" }]),
          status: "succeeded",
          deckTitle: "AI 導入策略",
        },
      ]);

      const { result } = renderHook(() => usePptMasterDeck());

      await waitFor(() => expect(result.current.deck?.title).toBe("AI 導入策略"));
      expect(result.current.slidePreviews[1]).toBeUndefined();
      expect(result.current.error).toBeNull();
    });
  });
});
