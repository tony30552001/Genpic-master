import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import SegmentGrid from "../SegmentGrid";

afterEach(cleanup);

describe("SegmentGrid", () => {
  it("shows a card for every segment, playable or not", () => {
    render(
      <SegmentGrid
        turn={{
          segments: [
            { index: 0, jobId: "a", status: "succeeded", durationSeconds: 5 },
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
    expect(within(cards[1]).getByText("生成中")).toBeInTheDocument();
    expect(within(cards[2]).getByRole("alert")).toHaveTextContent("內容違規");
  });
});
