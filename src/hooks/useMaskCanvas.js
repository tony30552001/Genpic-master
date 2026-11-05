import { useCallback, useRef, useState } from "react";

const PAINT = [239, 68, 68];

export const hasPaintPixels = (data) => {
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 0) return true;
  }
  return false;
};

/** Painted pixels become empty and empty pixels become fully painted. */
export const invertPaintPixels = (data) => {
  for (let index = 0; index < data.length; index += 4) {
    const painted = data[index + 3] > 0;
    data[index] = PAINT[0];
    data[index + 1] = PAINT[1];
    data[index + 2] = PAINT[2];
    data[index + 3] = painted ? 0 : 255;
  }
  return data;
};

const INITIAL_STATUS = { canUndo: false, canRedo: false, hasPaint: false };

/**
 * Paint layer for brush-masked edits. The canvas works in the source image's natural
 * pixels; CSS scales it over the displayed image. Each finished stroke or tool action
 * is one undoable snapshot. `exportMask` produces the OpenAI edit mask: painted areas
 * (to be edited) are transparent, everything else is opaque.
 */
export function useMaskCanvas() {
  const canvasRef = useRef(null);
  const historyRef = useRef({ snapshots: [], index: -1 });
  const strokeRef = useRef(null);
  const [status, setStatus] = useState(INITIAL_STATUS);

  const context = () => canvasRef.current?.getContext("2d", { willReadFrequently: true }) ?? null;

  const publish = useCallback(() => {
    const { snapshots, index } = historyRef.current;
    setStatus({
      canUndo: index > 0,
      canRedo: index < snapshots.length - 1,
      hasPaint: index >= 0 && snapshots[index].hasPaint,
    });
  }, []);

  const commit = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const history = historyRef.current;
    history.snapshots = history.snapshots.slice(0, history.index + 1);
    history.snapshots.push({ imageData, hasPaint: hasPaintPixels(imageData.data) });
    history.index = history.snapshots.length - 1;
    publish();
  }, [publish]);

  const restore = useCallback(
    (index) => {
      const ctx = context();
      const snapshot = historyRef.current.snapshots[index];
      if (!ctx || !snapshot) return;
      ctx.putImageData(snapshot.imageData, 0, 0);
      historyRef.current.index = index;
      publish();
    },
    [publish]
  );

  const reset = useCallback(
    (width, height) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = width;
      canvas.height = height;
      context()?.clearRect(0, 0, width, height);
      historyRef.current = { snapshots: [], index: -1 };
      commit();
    },
    [commit]
  );

  const beginStroke = useCallback((point, { size, erase }) => {
    const ctx = context();
    if (!ctx) return;
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.fillStyle = `rgb(${PAINT.join(",")})`;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    strokeRef.current = point;
  }, []);

  const extendStroke = useCallback((point) => {
    const ctx = context();
    const last = strokeRef.current;
    if (!ctx || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    strokeRef.current = point;
  }, []);

  const endStroke = useCallback(() => {
    if (!strokeRef.current) return;
    strokeRef.current = null;
    const ctx = context();
    if (ctx) ctx.globalCompositeOperation = "source-over";
    commit();
  }, [commit]);

  const undo = useCallback(() => {
    if (historyRef.current.index > 0) restore(historyRef.current.index - 1);
  }, [restore]);

  const redo = useCallback(() => {
    const { snapshots, index } = historyRef.current;
    if (index < snapshots.length - 1) restore(index + 1);
  }, [restore]);

  const invert = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    invertPaintPixels(imageData.data);
    ctx.putImageData(imageData, 0, 0);
    commit();
  }, [commit]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx || !status.hasPaint) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    commit();
  }, [commit, status.hasPaint]);

  const exportMask = useCallback(() => {
    const paint = canvasRef.current;
    const mask = document.createElement("canvas");
    mask.width = paint.width;
    mask.height = paint.height;
    const ctx = mask.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, mask.width, mask.height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.drawImage(paint, 0, 0);
    return new Promise((resolve, reject) => {
      mask.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("無法產生遮罩圖片"))), "image/png");
    });
  }, []);

  return { canvasRef, ...status, reset, beginStroke, extendStroke, endStroke, undo, redo, invert, clear, exportMask };
}
