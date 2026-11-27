import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SegmentGrid from "../SegmentGrid";
import { getSegmentPlayback } from "@/services/aiService";

vi.mock("@/services/aiService", async (load) => ({
  ...await load(),
  getSegmentPlayback: vi.fn(async ({ jobId }) => ({ url: `https://example.test/${jobId}?read`, expiresAt: new Date(Date.now() + 3600000).toISOString() })),
}));

afterEach(cleanup);

describe("SegmentGrid", () => {
  it("streams finished segments and downloads only through the separate file link", async () => {
    render(
      <SegmentGrid
        turn={{
          segments: [
            { index: 0, jobId: "a", status: "succeeded", durationSeconds: 5, reused: true },
            { index: 1, jobId: "b", status: "processing", phase: "polling" },
            { index: 2, jobId: "c", status: "failed", error: { message: "內容違規" } },
          ],
        }}
      />
    );

    const cards = within(screen.getByRole("list", { name: "影片分段" })).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    await waitFor(() => expect(screen.getByLabelText("第 1 段影片")).toHaveAttribute("src", "https://example.test/a?read"));
    expect(screen.getByRole("link", { name: "下載第 1 段" })).toHaveAttribute("href", "/api/video-jobs/a/video");
    expect(getSegmentPlayback).toHaveBeenCalledTimes(1);
    expect(cards[0]).toHaveTextContent("第 1 段 · 5 秒 · 沿用");
    expect(cards[1]).not.toHaveTextContent("沿用");
    expect(within(cards[1]).getByText("生成中")).toBeInTheDocument();
    expect(within(cards[2]).getByRole("alert")).toHaveTextContent("內容違規");
  });

  it("opens a segment for editing only when its shots are known", async () => {
    const onEdit = vi.fn();
    const segments = [
      { index: 0, jobId: "a", status: "succeeded", shotIds: ["s1"] },
      { index: 1, jobId: "b", status: "failed", shotIds: ["s2", "s3"], error: { message: "內容違規" } },
      { index: 2, jobId: "c", status: "failed", error: { message: "逾時" } },
    ];
    render(<SegmentGrid turn={{ segments }} onEdit={onEdit} />);
    await waitFor(() => expect(screen.getByLabelText("第 1 段影片")).toHaveAttribute("src"));

    fireEvent.click(screen.getByRole("button", { name: "修改第 1 段" }));
    fireEvent.click(screen.getByRole("button", { name: "修改這段分鏡" }));

    expect(onEdit.mock.calls.map(([segment]) => segment.index)).toEqual([0, 1]);
    expect(screen.queryByRole("button", { name: "修改第 3 段" })).not.toBeInTheDocument();
  });

  it("renews an expired stream at the same position and resets playback errors on replacement", async () => {
    getSegmentPlayback.mockResolvedValueOnce({ url: "https://example.test/old", expiresAt: new Date(0).toISOString() });
    const grid = (jobId) => <SegmentGrid turn={{ segments: [{ index: 0, jobId, status: "succeeded" }] }} />;
    const { rerender } = render(grid("a"));
    const video = screen.getByLabelText("第 1 段影片");
    await waitFor(() => expect(video).toHaveAttribute("src", "https://example.test/old"));
    video.currentTime = 3;
    fireEvent.error(video);
    await waitFor(() => expect(video).toHaveAttribute("src", "https://example.test/a?read"));
    video.currentTime = 0;
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(3);
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    rerender(grid("b"));
    await waitFor(() => expect(screen.getByLabelText("第 1 段影片")).toHaveAttribute("src", "https://example.test/b?read"));
  });
});
