import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ShotCard from "../ShotCard";
import { createShot } from "@/lib/videoStoryboard";

const IMAGE_ID = "33333333-3333-4333-8333-333333333333";

const renderShot = ({ index = 1, startFrameLocked = false, ...overrides } = {}) => {
  const onSetStartFrame = vi.fn();
  const shot = { ...createShot([]), action: "推門進店", references: [{ label: "Image1", uploadId: IMAGE_ID }], ...overrides };
  render(
    <ShotCard
      shot={shot}
      index={index}
      previews={{ [IMAGE_ID]: "data:image/webp;base64,AA" }}
      startFrameLocked={startFrameLocked}
      onChange={vi.fn()}
      onSetStartFrame={onSetStartFrame}
      onToggleCharacter={vi.fn()}
      onRewrite={vi.fn()}
      onFix={vi.fn()}
      onDelete={vi.fn()}
    />
  );
  return onSetStartFrame;
};

describe("ShotCard references", () => {
  afterEach(cleanup);

  it("sets and clears a reference as the start frame of a cut shot", () => {
    const onSetStartFrame = renderShot({ cut: true });
    fireEvent.click(screen.getByRole("button", { name: "Image1設為第 2 幕首影格" }));
    expect(onSetStartFrame).toHaveBeenCalledWith(IMAGE_ID);

    cleanup();
    const onClear = renderShot({ cut: true, startFrameUploadId: IMAGE_ID });
    const selected = screen.getByRole("button", { name: "Image1設為第 2 幕首影格" });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(selected);
    expect(onClear).toHaveBeenCalledWith(null);
  });

  it("disables start frames on a continuing shot and on shot 1 when the workspace has one", () => {
    renderShot();
    expect(screen.getByRole("button", { name: "Image1" })).toBeDisabled();
    expect(screen.getByText("開啟場景轉換後，可以把參考圖設為這一幕的首影格")).toBeInTheDocument();

    cleanup();
    renderShot({ index: 0, startFrameLocked: true });
    expect(screen.getByRole("button", { name: "Image1" })).toBeDisabled();
    expect(screen.getByText("已附加首影格，第 1 幕不能再設定首影格")).toBeInTheDocument();
  });
});
