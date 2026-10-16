import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/aiService", () => ({ analyzeStyle: vi.fn() }));
vi.mock("@/services/storageService", () => ({ uploadFile: vi.fn() }));

import ChatComposer from "../ChatComposer";

const renderComposer = (props = {}) => {
  const handlers = {
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onStop: vi.fn(),
    onAttachmentChange: vi.fn(),
    onStyleChange: vi.fn(),
    onClearSelectedVersion: vi.fn(),
    onSettingsChange: vi.fn(),
  };
  render(
    <ChatComposer
      draft=""
      sending={null}
      attachment={null}
      style={null}
      selectedVersionLabel=""
      settings={{ aspectRatio: "16:9", quality: null, imageLanguage: "zh-TW", purpose: "infographic" }}
      quality="medium"
      supportedQualities={["low", "medium", "high"]}
      savedStyles={[]}
      templates={[]}
      configurationError=""
      disabled={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe("ChatComposer", () => {
  afterEach(cleanup);

  it("sends the draft with Enter but not while composing with an IME", () => {
    const { onSend } = renderComposer({ draft: "畫一隻貓" });
    const textarea = screen.getByRole("textbox", { name: "訊息" });

    fireEvent.keyDown(textarea, { key: "Enter", isComposing: true });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("畫一隻貓");
  });

  it("blocks sending while the image model is not configured", () => {
    const { onSend } = renderComposer({ draft: "畫一隻貓", configurationError: "圖片模型尚未完成設定" });

    expect(screen.getByRole("button", { name: "送出訊息" }).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("圖片模型尚未完成設定");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "訊息" }), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("turns the send button into stop while a reply streams", () => {
    const { onStop } = renderComposer({ sending: { chatId: "c1", turnId: "t1", phase: "streaming" } });

    fireEvent.click(screen.getByRole("button", { name: "停止回覆" }));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows the style and base version as removable chips", () => {
    const { onStyleChange, onClearSelectedVersion } = renderComposer({
      style: { name: "水彩", prompt: "watercolor", tags: [] },
      selectedVersionLabel: "v2",
    });

    expect(screen.getByText("以 v2 為基礎")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "移除風格" }));
    fireEvent.click(screen.getByRole("button", { name: "不以目前版本為基礎" }));
    expect(onStyleChange).toHaveBeenCalledWith(null);
    expect(onClearSelectedVersion).toHaveBeenCalled();
  });
});
