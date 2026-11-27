import React, { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StoryboardTimeline from "../StoryboardTimeline";

const shots = [{ id: "s1", duration: 3 }, { id: "s2", duration: 5 }];
const segments = shots.map((shot, index) => ({ index, shotIds: [shot.id], durationSeconds: shot.duration }));
const renderTimeline = () => {
  const jump = vi.fn();
  function Board() {
    const [items, setItems] = useState(shots);
    return <StoryboardTimeline shots={items} segments={segments} warnedIds={new Set(["s1"])} changedIds={[]} onJump={jump}
      onReorder={() => { setItems([...items].reverse()); return "已變更順序"; }} />;
  }
  render(<Board />);
  return jump;
};
const buttons = () => within(screen.getByRole("group", { name: "分鏡時間軸" })).getAllByRole("button");

describe("StoryboardTimeline sorting", () => {
  afterEach(cleanup);

  it("moves the focused shot by keyboard, preserving focus and discarding obsolete segment boundaries", () => {
    const jump = renderTimeline();
    const first = buttons()[0];
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight", altKey: true });
    expect(buttons()[1]).toBe(first);
    expect(first).toHaveFocus();
    expect(first).toHaveAccessibleName("第 2 幕，約 3 秒，有提醒");
    expect(screen.getByRole("status")).toHaveTextContent("已變更順序");
    expect(jump).not.toHaveBeenCalled();
  });

  it("supports two taps as a non-drag alternative without changing ordinary tap-to-edit", () => {
    const jump = renderTimeline();
    fireEvent.click(buttons()[0]);
    expect(jump).toHaveBeenCalledWith("s1");
    fireEvent.click(screen.getByRole("button", { name: "調整順序" }));
    fireEvent.click(buttons()[0]);
    expect(buttons()[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(buttons()[1]);
    expect(buttons()[1]).toHaveAccessibleName("第 2 幕，約 3 秒，有提醒");
    expect(jump).toHaveBeenCalledTimes(1);
  });

  it("previews a pointer drag, commits on release only and reverts on pointer cancellation", () => {
    const jump = renderTimeline();
    const track = screen.getByRole("group", { name: "分鏡時間軸" });
    const first = buttons()[0];
    buttons().forEach((item, i) => {
      Object.defineProperties(item, { offsetLeft: { value: 100 * i }, offsetWidth: { value: 100 } });
    });
    const point = (x) => ({ clientX: x, pointerType: "touch", pointerId: 1, isPrimary: true, button: 0 });
    fireEvent.pointerDown(first, point(25));
    fireEvent.pointerMove(track, point(160));
    expect(buttons()[1]).toBe(first);
    fireEvent.pointerCancel(track, point(160));
    expect(buttons()[0]).toBe(first);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.pointerDown(first, point(25));
    fireEvent.pointerMove(track, point(160));
    fireEvent.pointerUp(track, point(160));
    expect(buttons()[1]).toBe(first);
    expect(screen.getByRole("status")).toHaveTextContent("已變更順序");
    expect(jump).not.toHaveBeenCalled();
  });
});
