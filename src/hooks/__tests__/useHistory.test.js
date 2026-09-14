import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/storageService", () => ({
  addHistoryItem: vi.fn(),
  deleteHistoryItem: vi.fn(),
  listHistory: vi.fn(),
}));

import { addHistoryItem, listHistory } from "../../services/storageService";
import useHistory from "../useHistory";

const user = { id: "user-1" };

describe("useHistory", () => {
  let canvas;
  let drawImage;
  beforeEach(() => {
    vi.clearAllMocks();
    listHistory.mockResolvedValue([]);
    addHistoryItem.mockResolvedValue({ id: "history-1" });
    vi.stubGlobal("Image", class {
      width = 1600;
      height = 1000;
      set src(value) {
        this.url = value;
        queueMicrotask(() => this.onload());
      }
    });
    drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function () {
      canvas = this;
      return { drawImage };
    });
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,compressed");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves jobId while compressing to max width 800 / JPEG 0.6 and refreshing history", async () => {
    const { result } = renderHook(() => useHistory({ user }));
    await waitFor(() => expect(listHistory).toHaveBeenCalledOnce());
    const payload = {
      jobId: "original-job", imageUrl: "provider-image", userScript: "scene",
      stylePrompt: "ink", fullPrompt: "assembled", styleId: "style-1", source: "document",
    };
    listHistory.mockResolvedValueOnce([{ id: "history-1", jobId: "original-job", model: "original-model" }]);
    await act(async () => {
      await result.current.saveHistoryItem({ ...payload, model: "new-policy-model" });
    });
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(500);
    expect(drawImage).toHaveBeenCalledWith(expect.any(Image), 0, 0, 800, 500);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/jpeg", 0.6);
    expect(addHistoryItem).toHaveBeenCalledWith({ ...payload, imageUrl: "data:image/jpeg;base64,compressed" });
    expect(result.current.historyItems).toEqual([{ id: "history-1", jobId: "original-job", model: "original-model" }]);
  });

  it("does not compress or post without a job identity", async () => {
    const { result } = renderHook(() => useHistory({ user }));
    await act(async () => {
      await expect(result.current.saveHistoryItem({ imageUrl: "image" })).rejects.toThrow("工作識別");
    });
    expect(drawImage).not.toHaveBeenCalled();
    expect(addHistoryItem).not.toHaveBeenCalled();
  });

  it("surfaces a failed history save instead of refreshing into a false success", async () => {
    const { result } = renderHook(() => useHistory({ user }));
    await waitFor(() => expect(listHistory).toHaveBeenCalledOnce());
    addHistoryItem.mockRejectedValueOnce(new Error("Job does not belong to user"));
    await act(async () => {
      await expect(result.current.saveHistoryItem({ jobId: "foreign-job", imageUrl: "image" })).rejects.toThrow("Job does not belong");
    });
    expect(listHistory).toHaveBeenCalledOnce();
  });
});
