import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import ChatStartView from "../ChatStartView";

const renderStart = (historyItems) => {
  const onContinue = vi.fn();
  render(
    <MemoryRouter>
      <ChatStartView historyItems={historyItems} onContinue={onContinue}>
        <textarea aria-label="訊息" />
      </ChatStartView>
    </MemoryRouter>
  );
  return onContinue;
};

describe("ChatStartView", () => {
  afterEach(cleanup);

  it("lists recent images and continues editing the picked one", () => {
    const items = [
      { id: "h1", imageUrl: "data:image/png;base64,a", userScript: "Q3 營收結構" },
      { id: "h2", imageUrl: "", userScript: "沒有圖片" },
    ];
    const onContinue = renderStart(items);

    expect(screen.getByRole("heading", { name: "我的近期作品" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /沒有圖片/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "接續修改：Q3 營收結構" }));
    expect(onContinue).toHaveBeenCalledWith(items[0]);
    expect(screen.getByRole("link", { name: "在素材中心查看全部" }).getAttribute("href")).toBe("/library?section=images");
  });

  it("shows only the composer when there is no history", () => {
    renderStart([]);

    expect(screen.getByRole("textbox", { name: "訊息" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "我的近期作品" })).toBeNull();
  });
});
