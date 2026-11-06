import React, { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const maskBlob = new Blob(["mask"], { type: "image/png" });
const maskCalls = vi.hoisted(() => ({ resetFn: null, strokes: [] }));

vi.mock("@/hooks/useMaskCanvas", () => ({
  useMaskCanvas: () => {
    const [hasPaint, setHasPaint] = useState(false);
    return {
      canvasRef: { current: null },
      hasPaint,
      canUndo: hasPaint,
      canRedo: false,
      reset: maskCalls.resetFn,
      beginStroke: (point, options) => maskCalls.strokes.push({ point, options }),
      extendStroke: () => {},
      endStroke: () => setHasPaint(true),
      undo: () => setHasPaint(false),
      redo: () => {},
      invert: () => {},
      clear: () => setHasPaint(false),
      exportMask: () => Promise.resolve(maskBlob),
    };
  },
}));

import PreciseEditor from "../PreciseEditor";

const sizeDescriptors = {};
const stubLayout = (property, value) => {
  sizeDescriptors[property] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, property);
  Object.defineProperty(HTMLElement.prototype, property, { configurable: true, get: () => value });
};

const renderEditor = (props = {}) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const element = (extra) => (
    <PreciseEditor
      imageUrl="/api/image.png"
      title="精確編輯 · v2"
      subtitle="結果會成為 v2 的新版本"
      onApply={onApply}
      onClose={onClose}
      {...props}
      {...extra}
    />
  );
  const { rerender } = render(element());
  const image = screen.getByAltText("要編輯的圖片");
  Object.defineProperty(image, "naturalWidth", { value: 1600 });
  Object.defineProperty(image, "naturalHeight", { value: 800 });
  fireEvent.load(image);
  const surface = image.closest("[data-paint-surface]");
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 400 });
  return { onApply, onClose, surface, update: (extra) => rerender(element(extra)) };
};

const paint = (surface) => {
  fireEvent.pointerDown(surface, { button: 0, clientX: 200, clientY: 100, pointerId: 1 });
  fireEvent.pointerUp(surface, { pointerId: 1 });
};

describe("PreciseEditor", () => {
  beforeEach(() => {
    maskCalls.resetFn = vi.fn();
    maskCalls.strokes = [];
    stubLayout("clientWidth", 800);
    stubLayout("clientHeight", 600);
  });

  afterEach(() => {
    cleanup();
    for (const [property, descriptor] of Object.entries(sizeDescriptors)) {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor);
      else delete HTMLElement.prototype[property];
    }
    window.history.replaceState(null, "");
  });

  it("sizes the paint layer to the image and paints in natural pixels", () => {
    const { surface } = renderEditor();

    expect(maskCalls.resetFn).toHaveBeenCalledWith(1600, 800);
    expect(surface).toHaveStyle({ width: "800px", height: "400px" });
    paint(surface);
    expect(maskCalls.strokes).toEqual([{ point: { x: 400, y: 200 }, options: { size: 96, erase: false } }]);
  });

  it("applies only with paint and an instruction and stays open to show the generation", async () => {
    const { surface, onApply, onClose, update } = renderEditor();
    const apply = screen.getByRole("button", { name: "套用" });
    const instruction = screen.getByRole("textbox", { name: "描述要修改的地方" });

    fireEvent.change(instruction, { target: { value: " 把花換成向日葵 " } });
    expect(apply).toBeDisabled();
    paint(surface);
    expect(apply).toBeEnabled();

    fireEvent.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledWith({ instruction: "把花換成向日葵", mask: maskBlob }));
    update({ isGenerating: true });
    expect(screen.getByRole("status")).toHaveTextContent("正在產生新版本");
    expect(screen.getByRole("button", { name: "產生中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "橡皮擦" })).toBeDisabled();
    fireEvent.pointerDown(surface, { button: 0, clientX: 10, clientY: 10, pointerId: 2 });
    expect(maskCalls.strokes).toHaveLength(1);

    update({ isGenerating: false, imageUrl: "/api/next.png" });
    expect(screen.getByAltText("要編輯的圖片")).toHaveAttribute("src", "/api/next.png");
    expect(instruction).toHaveValue("");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps the instruction and shows the error when the generation fails", () => {
    const { surface, update } = renderEditor();
    const instruction = screen.getByRole("textbox", { name: "描述要修改的地方" });
    fireEvent.change(instruction, { target: { value: "把花換成向日葵" } });
    paint(surface);

    update({ isGenerating: true });
    update({ isGenerating: false, error: "模型忙碌" });
    expect(screen.getByRole("alert")).toHaveTextContent("模型忙碌");
    expect(instruction).toHaveValue("把花換成向日葵");
  });

  it("shows the version rail beside the image", () => {
    renderEditor({ versionStrip: <nav aria-label="版本列" /> });
    expect(screen.getByRole("navigation", { name: "版本列" })).toBeInTheDocument();
  });

  it("erases with the eraser tool", () => {
    const { surface } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "橡皮擦" }));
    paint(surface);
    expect(maskCalls.strokes[0].options.erase).toBe(true);
  });

  it("asks before discarding paint", async () => {
    const { surface, onClose } = renderEditor();
    paint(surface);

    fireEvent.click(screen.getByRole("button", { name: "關閉精確編輯" }));
    expect(await screen.findByRole("alertdialog", { name: "放棄這次編輯？" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "繼續編輯" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(await screen.findByRole("button", { name: "放棄" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("closes without asking when the editor is untouched", async () => {
    const { onClose } = renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "關閉精確編輯" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
