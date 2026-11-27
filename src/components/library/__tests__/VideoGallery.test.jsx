import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VideoGallery from "../VideoGallery";
import { downloadVideo, downloadVideoSubtitles, getVideoPlayback } from "@/services/aiService";

vi.mock("@/services/aiService", () => ({
  downloadVideo: vi.fn(),
  downloadVideoSubtitles: vi.fn(),
  getVideoPlayback: vi.fn(),
}));

const item = (projectId, extra = {}) => ({ id: `h-${projectId}`, videoProjectId: projectId, userScript: "病房清潔七步驟", model: "fal-minimax", ...extra });

const renderGallery = (items) =>
  render(<VideoGallery historyItems={items} searchQuery="" onDelete={vi.fn()} onGoCreate={vi.fn()} />);

describe("VideoGallery", () => {
  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
      disconnect() {}
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("previews each visible card from its signed playback URL", async () => {
    getVideoPlayback.mockResolvedValue({ url: "https://blob/p1.mp4?sig", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    const { container } = renderGallery([item("p1")]);

    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("src", "https://blob/p1.mp4?sig#t=0.1"));
    expect(container.querySelector("video")).toHaveAttribute("preload", "metadata");
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("opens the player at once and streams the signed URL without downloading the file", async () => {
    let resolvePlayback;
    getVideoPlayback.mockReturnValue(new Promise((resolve) => {
      resolvePlayback = resolve;
    }));
    renderGallery([item("p2")]);

    fireEvent.click(screen.getByRole("button", { name: /病房清潔七步驟/ }));
    const dialog = screen.getByRole("dialog", { name: "影片詳情" });
    expect(screen.getByRole("status")).toHaveTextContent("影片載入中");
    expect(getVideoPlayback).toHaveBeenCalledTimes(1);

    resolvePlayback({ url: "https://blob/p2.mp4?sig", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    await waitFor(() => expect(dialog.querySelector("video")).toHaveAttribute("src", "https://blob/p2.mp4?sig"));
    expect(downloadVideo).not.toHaveBeenCalled();
  });

  it("shows SRT badge and downloads authenticated subtitles when hasSubtitles is true", async () => {
    getVideoPlayback.mockResolvedValue({ url: "https://blob/p3.mp4?sig", expiresAt: new Date(Date.now() + 3600_000).toISOString() });
    downloadVideoSubtitles.mockResolvedValue(new Blob(["1\n00:00:00,000 --> 00:00:02,000\n旁白\n"], { type: "text/plain" }));
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:srt");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    renderGallery([item("p3", { hasSubtitles: true })]);
    expect(screen.getByText("SRT 字幕")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /病房清潔七步驟/ }));
    fireEvent.click(screen.getByRole("button", { name: "下載字幕 (.srt)" }));

    await waitFor(() => expect(downloadVideoSubtitles).toHaveBeenCalledWith({ projectId: "p3" }));
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
