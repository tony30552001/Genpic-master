import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../services/aiService", () => ({
  createDeckJob: vi.fn(),
  downloadDeckJobPptx: vi.fn(),
  getDeckJob: vi.fn(),
  listPptTemplates: vi.fn(() => Promise.resolve({ styles: [], layouts: [] })),
  waitForDeckJob: vi.fn(),
}));

vi.mock("../../services/storageService", () => ({
  uploadFileToBlob: vi.fn(),
}));

import { createDeckJob, getDeckJob, waitForDeckJob } from "../../services/aiService";
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
    createDeckJob.mockResolvedValue({ jobId: "deck-3", status: "queued" });
    waitForDeckJob.mockImplementation(async () => {
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
});
