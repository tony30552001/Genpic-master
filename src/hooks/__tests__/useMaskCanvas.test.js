import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hasPaintPixels, invertPaintPixels, useMaskCanvas } from "../useMaskCanvas";

const createFakeCanvas = () => {
  const canvas = { width: 0, height: 0 };
  let pixels = new Uint8ClampedArray(0);
  let target = null;
  const setPixel = (point, alpha) => {
    const offset = (Math.round(point.y) * canvas.width + Math.round(point.x)) * 4;
    pixels.set([239, 68, 68, alpha], offset);
  };
  const ctx = {
    globalCompositeOperation: "source-over",
    clearRect: () => {
      pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
    },
    getImageData: () => ({ data: new Uint8ClampedArray(pixels), width: canvas.width, height: canvas.height }),
    putImageData: (imageData) => {
      pixels = new Uint8ClampedArray(imageData.data);
    },
    beginPath: () => {},
    moveTo: () => {},
    arc: (x, y) => {
      target = { x, y };
    },
    lineTo: (x, y) => {
      target = { x, y };
    },
    fill: () => setPixel(target, ctx.globalCompositeOperation === "destination-out" ? 0 : 255),
    stroke: () => setPixel(target, ctx.globalCompositeOperation === "destination-out" ? 0 : 255),
  };
  canvas.getContext = () => ctx;
  canvas.pixels = () => pixels;
  return canvas;
};

const renderMaskCanvas = () => {
  const hook = renderHook(() => useMaskCanvas());
  const canvas = createFakeCanvas();
  hook.result.current.canvasRef.current = canvas;
  act(() => hook.result.current.reset(4, 2));
  return { hook, canvas };
};

const paint = (hook, point, options = { size: 1, erase: false }) => {
  act(() => {
    hook.result.current.beginStroke(point, options);
    hook.result.current.endStroke();
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("mask pixel helpers", () => {
  it("detects paint and inverts the selection", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 0, 239, 68, 68, 255]);
    expect(hasPaintPixels(data)).toBe(true);
    expect(Array.from(invertPaintPixels(data))).toEqual([239, 68, 68, 255, 239, 68, 68, 0]);
    expect(hasPaintPixels(new Uint8ClampedArray(8))).toBe(false);
  });
});

describe("useMaskCanvas", () => {
  it("sizes the layer to the source and starts empty", () => {
    const { hook, canvas } = renderMaskCanvas();
    expect(canvas).toMatchObject({ width: 4, height: 2 });
    expect(hook.result.current).toMatchObject({ canUndo: false, canRedo: false, hasPaint: false });
  });

  it("undoes and redoes finished strokes, and a new stroke drops the redo branch", () => {
    const { hook } = renderMaskCanvas();
    paint(hook, { x: 1, y: 0 });
    expect(hook.result.current).toMatchObject({ canUndo: true, hasPaint: true });

    act(() => hook.result.current.undo());
    expect(hook.result.current).toMatchObject({ canUndo: false, canRedo: true, hasPaint: false });

    act(() => hook.result.current.redo());
    expect(hook.result.current).toMatchObject({ canRedo: false, hasPaint: true });

    act(() => hook.result.current.undo());
    paint(hook, { x: 2, y: 1 });
    expect(hook.result.current.canRedo).toBe(false);
  });

  it("erases paint and clears everything as undoable steps", () => {
    const { hook } = renderMaskCanvas();
    paint(hook, { x: 1, y: 0 });
    paint(hook, { x: 1, y: 0 }, { size: 1, erase: true });
    expect(hook.result.current.hasPaint).toBe(false);

    act(() => hook.result.current.undo());
    act(() => hook.result.current.clear());
    expect(hook.result.current).toMatchObject({ hasPaint: false, canUndo: true });
    act(() => hook.result.current.undo());
    expect(hook.result.current.hasPaint).toBe(true);
  });

  it("inverts the selection so every unpainted pixel becomes the edit area", () => {
    const { hook, canvas } = renderMaskCanvas();
    paint(hook, { x: 0, y: 0 });
    act(() => hook.result.current.invert());
    const alpha = Array.from(canvas.pixels()).filter((_, index) => index % 4 === 3);
    expect(alpha).toEqual([0, 255, 255, 255, 255, 255, 255, 255]);
  });

  it("exports a PNG with the paint layer's size, punching painted areas out of an opaque fill", async () => {
    const { hook, canvas } = renderMaskCanvas();
    const calls = [];
    const maskCtx = {
      fillRect: (...args) => calls.push(["fillRect", ...args]),
      drawImage: (source) => calls.push(["drawImage", source, maskCtx.globalCompositeOperation]),
    };
    const blob = new Blob(["png"], { type: "image/png" });
    const createElement = document.createElement.bind(document);
    let mask;
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag !== "canvas") return createElement(tag);
      mask = { getContext: () => maskCtx, toBlob: (callback, type) => callback(type === "image/png" ? blob : null) };
      return mask;
    });

    await expect(hook.result.current.exportMask()).resolves.toBe(blob);
    expect(mask).toMatchObject({ width: 4, height: 2 });
    expect(calls).toEqual([
      ["fillRect", 0, 0, 4, 2],
      ["drawImage", canvas, "destination-out"],
    ]);
  });
});
