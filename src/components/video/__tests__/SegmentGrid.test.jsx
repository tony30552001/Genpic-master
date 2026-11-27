import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import SegmentGrid from "../SegmentGrid";

afterEach(cleanup);

describe("SegmentGrid", () => {
  it("shows a card for every segment, playable or not", () => {
    render(
      <SegmentGrid
        turn={{
          segments: [
            { index: 0, jobId: "a", status: "succeeded", durationSeconds: 5, reused: true },
            { index: 1, jobId: "b", status: "processing", phase: "polling" },
            { index: 2, jobId: "c", status: "failed", error: { message: "內容違規" } },
          ],
          segmentUrls: { a: "blob:a" },
        }}
      />
    );

    const cards = within(screen.getByRole("list", { name: "影片分段" })).getAllByRole("listitem");
    expect(cards).toHaveLength(3);
    expect(screen.getByLabelText("第 1 段影片")).toHaveAttribute("src", "blob:a");
    expect(cards[0]).toHaveTextContent("第 1 段 · 5 秒 · 沿用");
    expect(cards[1]).not.toHaveTextContent("沿用");
    expect(within(cards[1]).getByText("生成中")).toBeInTheDocument();
    expect(within(cards[2]).getByRole("alert")).toHaveTextContent("內容違規");
  });

  it("opens a segment for editing only when its shots are known", () => {
    const onEdit = vi.fn();
    const segments = [
      { index: 0, jobId: "a", status: "succeeded", shotIds: ["s1"] },
      { index: 1, jobId: "b", status: "failed", shotIds: ["s2", "s3"], error: { message: "內容違規" } },
      { index: 2, jobId: "c", status: "failed", error: { message: "逾時" } },
    ];
    render(<SegmentGrid turn={{ segments, segmentUrls: { a: "blob:a" } }} onEdit={onEdit} />);

    fireEvent.click(screen.getByRole("button", { name: "修改第 1 段" }));
    fireEvent.click(screen.getByRole("button", { name: "修改這段分鏡" }));

    expect(onEdit.mock.calls.map(([segment]) => segment.index)).toEqual([0, 1]);
    expect(screen.queryByRole("button", { name: "修改第 3 段" })).not.toBeInTheDocument();
  });
});
