import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/aiService", () => ({ analyzeStyle: vi.fn() }));
vi.mock("@/services/storageService", () => ({ uploadFile: vi.fn() }));

import { uploadFile } from "@/services/storageService";
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

  it("breaks the line with Enter on touch keyboards instead of sending", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { onSend } = renderComposer({ draft: "畫一隻貓" });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "訊息" }), { key: "Enter" });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "送出訊息" }));
    expect(onSend).toHaveBeenCalledWith("畫一隻貓");
    matchMedia.mockRestore();
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

  it("attaches an image pasted into the message box and keeps text pastes", async () => {
    uploadFile.mockResolvedValue({ uploadId: "u2" });
    const { onAttachmentChange } = renderComposer();
    const textarea = screen.getByRole("textbox", { name: "訊息" });
    const image = new File(["png"], "image.png", { type: "image/png" });

    const textPaste = { getData: () => "一段文字", items: [] };
    expect(fireEvent.paste(textarea, { clipboardData: textPaste })).toBe(true);
    expect(uploadFile).not.toHaveBeenCalled();

    const imagePaste = { getData: () => "", items: [{ kind: "file", type: "image/png", getAsFile: () => image }] };
    await act(async () => {
      expect(fireEvent.paste(textarea, { clipboardData: imagePaste })).toBe(false);
    });
    expect(uploadFile).toHaveBeenCalledWith(image, "image");
    await vi.waitFor(() =>
      expect(onAttachmentChange).toHaveBeenCalledWith(expect.objectContaining({ uploadId: "u2", name: "image.png" }))
    );
  });

  it("attaches an existing image by URL through the ref", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["x"], { type: "image/jpeg" }),
    });
    uploadFile.mockResolvedValue({ uploadId: "u1" });
    const ref = createRef();
    const { onAttachmentChange } = renderComposer({ ref });

    await act(() => ref.current.attachImageUrl("data:image/jpeg;base64,eA==", "history-h1"));

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({ name: "history-h1.jpeg" }), "image");
    expect(onAttachmentChange).toHaveBeenCalledWith({
      uploadId: "u1",
      name: "history-h1.jpeg",
      previewUrl: "data:image/jpeg;base64,eA==",
    });
    fetchMock.mockRestore();
  });

  it("shows the error when an image cannot be attached by URL", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: false });
    const ref = createRef();
    const { onAttachmentChange } = renderComposer({ ref });

    await act(() => ref.current.attachImageUrl("https://example.com/a.png", "history-h1"));

    expect(screen.getByRole("alert").textContent).toContain("無法取得目前的圖片");
    expect(onAttachmentChange).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
