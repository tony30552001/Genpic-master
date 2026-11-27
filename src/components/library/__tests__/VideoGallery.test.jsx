import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VideoGallery from "../VideoGallery";
import { downloadVideo, getVideoPlayback } from "@/services/aiService";

vi.mock("@/services/aiService", () => ({
  downloadVideo: vi.fn(),
  getVideoPlayback: vi.fn(),
}));

const item = (projectId) => ({ id: `h-${projectId}`, videoProjectId: projectId, userScript: "病房清潔七步驟", model: "fal-minimax" });

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
});
