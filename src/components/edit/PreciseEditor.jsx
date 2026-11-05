import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import * as M from "motion/react-m";
import {
  ArrowLeft,
  ArrowUp,
  Blend,
  Eraser,
  Paintbrush,
  Redo2,
  Trash2,
  Undo2,
} from "@/components/icons/lucideControls";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";
import { useMaskCanvas } from "@/hooks/useMaskCanvas";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";

const MIN_BRUSH = 8;
const MAX_BRUSH = 160;
const DEFAULT_BRUSH = 48;

const TOOLS = [
  { id: "brush", label: "筆刷", Icon: Paintbrush },
  { id: "eraser", label: "橡皮擦", Icon: Eraser },
];

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const fitInside = (natural, box) => {
  if (!natural || box.width <= 0 || box.height <= 0) return null;
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  return { width: Math.round(natural.width * scale), height: Math.round(natural.height * scale) };
};

function ActionButton({ icon: Icon, label, className, ...props }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl bg-muted text-[11px] text-foreground transition-colors duration-(--motion-hover) hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 lg:h-10 lg:flex-row lg:gap-1.5 lg:text-[13px]",
        className
      )}
      {...props}
    >
      <Icon className="icon-sm" aria-hidden="true" />
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/**
 * Full-screen brush-mask editor. The user paints the area to change and describes
 * the change; `onApply({ instruction, mask })` receives the instruction and a PNG mask
 * blob (painted area transparent) at the image's natural size. The editor closes as
 * soon as the request is handed over; progress and errors surface where it was opened.
 */
export default function PreciseEditor({ imageUrl, title, subtitle, onApply, onClose }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const requestClose = useHistoryLayer(onClose, closeButtonRef);
  const {
    canvasRef,
    canUndo,
    canRedo,
    hasPaint,
    reset,
    beginStroke,
    extendStroke,
    endStroke,
    undo,
    redo,
    invert,
    clear,
    exportMask,
  } = useMaskCanvas();
  const isTouch = useMediaQuery("(pointer: coarse)");
  const stageRef = useRef(null);
  const paintingRef = useRef(false);
  const [natural, setNatural] = useState(null);
  const [stageBox, setStageBox] = useState({ width: 0, height: 0 });
  const [imageFailed, setImageFailed] = useState(false);
  const [tool, setTool] = useState("brush");
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH);
  const [cursor, setCursor] = useState(null);
  const [instruction, setInstruction] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const display = fitInside(natural, stageBox);
  const dirty = hasPaint || Boolean(instruction.trim());
  const canApply = hasPaint && Boolean(instruction.trim()) && !isApplying;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    const measure = () => {
      const style = getComputedStyle(stage);
      setStageBox({
        width: stage.clientWidth - parseFloat(style.paddingLeft || 0) - parseFloat(style.paddingRight || 0),
        height: stage.clientHeight - parseFloat(style.paddingTop || 0) - parseFloat(style.paddingBottom || 0),
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (natural) reset(natural.width, natural.height);
  }, [natural, reset]);

  const askToClose = () => {
    if (dirty) setConfirmDiscard(true);
    else requestClose();
  };

  // Esc with unsaved work asks first instead of letting the history layer close the
  // editor; Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z step through the paint history.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        if (dirty && !confirmDiscard) {
          event.preventDefault();
          setConfirmDiscard(true);
        }
        return;
      }
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z" || isTypingTarget(event.target)) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dirty, confirmDiscard, undo, redo]);

  const toCanvasPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * natural.width,
      y: ((event.clientY - rect.top) / rect.height) * natural.height,
    };
  };
  const trackCursor = (event) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  const finishStroke = () => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    endStroke();
  };

  const paintHandlers = {
    onPointerDown: (event) => {
      if (!display || event.button !== 0) return;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      paintingRef.current = true;
      beginStroke(toCanvasPoint(event), {
        size: (brushSize * natural.width) / display.width,
        erase: tool === "eraser",
      });
      trackCursor(event);
    },
    onPointerMove: (event) => {
      trackCursor(event);
      if (paintingRef.current) extendStroke(toCanvasPoint(event));
    },
    onPointerUp: finishStroke,
    onPointerCancel: finishStroke,
    onPointerLeave: () => setCursor(null),
  };

  const apply = async (event) => {
    event.preventDefault();
    if (!canApply) return;
    setIsApplying(true);
    setApplyError("");
    try {
      const blob = await exportMask();
      onApply({ instruction: instruction.trim(), mask: blob });
      requestClose();
    } catch (error) {
      setApplyError(error.message || "無法產生遮罩，請再試一次");
      setIsApplying(false);
    }
  };

  const resetAll = () => {
    clear();
    setInstruction("");
    setApplyError("");
  };

  return (
    <M.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 grid grid-rows-[minmax(0,1fr)_auto] bg-background lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      data-precise-editor
    >
      <div className="flex min-h-0 min-w-0 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 px-3 pt-[env(safe-area-inset-top)]">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={askToClose}
            aria-label="關閉精確編輯"
            className="grid size-9 shrink-0 place-items-center rounded-[10px] text-muted-foreground transition-colors duration-(--motion-hover) hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="icon-md" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h2 id={titleId} className="truncate text-sm font-semibold text-foreground">{title}</h2>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div ref={stageRef} className="flex min-h-0 flex-1 items-center justify-center px-3 pb-2 pt-1 lg:px-8 lg:pb-8 lg:pt-3">
          {imageFailed ? (
            <p role="alert" className="text-sm text-destructive">圖片載入失敗，請關閉後再試一次。</p>
          ) : (
            <div
              className={cn("relative touch-none select-none", !display && "invisible")}
              style={display ?? { width: 1, height: 1 }}
              data-paint-surface
              {...paintHandlers}
            >
              <img
                src={imageUrl}
                alt="要編輯的圖片"
                draggable={false}
                onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                onError={() => setImageFailed(true)}
                className="absolute inset-0 size-full rounded-lg object-fill"
              />
              <canvas
                ref={canvasRef}
                role="img"
                aria-label="塗抹要修改的區域"
                className={cn("absolute inset-0 size-full rounded-lg opacity-45", cursor ? "cursor-none" : "cursor-crosshair")}
              />
              {cursor && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
                  style={{ left: cursor.x, top: cursor.y, width: brushSize, height: brushSize }}
                  data-brush-cursor
                />
              )}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={apply}
        aria-label="編輯工具"
        className="flex min-h-0 flex-col gap-2.5 rounded-t-[20px] border-t border-border bg-card px-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 lg:gap-3 lg:rounded-none lg:border-l lg:border-t-0 lg:p-4"
      >
        <div className="flex gap-1 rounded-xl bg-muted p-1" role="group" aria-label="工具">
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] transition-colors duration-(--motion-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tool === id ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="icon-sm" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2">
          <span className="shrink-0 text-xs text-muted-foreground">筆刷大小</span>
          <input
            type="range"
            min={MIN_BRUSH}
            max={MAX_BRUSH}
            value={brushSize}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="min-w-0 flex-1 accent-foreground"
          />
          <span className="w-7 text-right text-xs tabular-nums text-muted-foreground">{brushSize}</span>
        </label>

        <div className="grid grid-cols-4 gap-1.5 lg:grid-cols-2 lg:gap-2">
          <ActionButton icon={Undo2} label="復原" onClick={undo} disabled={!canUndo} />
          <ActionButton icon={Redo2} label="重做" onClick={redo} disabled={!canRedo} />
          <ActionButton icon={Blend} label="反轉選取" onClick={invert} disabled={!natural} />
          <ActionButton icon={Trash2} label="清除全部" onClick={clear} disabled={!hasPaint} />
        </div>

        <p className="hidden text-xs leading-relaxed text-muted-foreground lg:block">
          在圖片上塗抹要修改的區域，再描述要怎麼改。模型會以塗抹區域為主修改，周圍可能有些微變化。
        </p>
        <div className="hidden flex-1 lg:block" />

        <div className="rounded-[14px] border border-border bg-background px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey || isTouch || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (canApply) event.currentTarget.form?.requestSubmit();
            }}
            rows={2}
            placeholder="例如：把這朵花換成向日葵"
            aria-label="描述要修改的地方"
            aria-invalid={Boolean(applyError)}
            className="field-sizing-content block max-h-[154px] min-h-11 w-full resize-none bg-transparent text-sm leading-[22px] text-foreground outline-none placeholder:text-muted-foreground lg:min-h-[66px]"
          />
        </div>
        {applyError && <p role="alert" className="text-xs text-destructive">{applyError}</p>}

        <div className="grid grid-cols-[auto_1fr] gap-2 lg:grid-cols-2">
          <button
            type="button"
            onClick={resetAll}
            disabled={!dirty}
            className="h-11 rounded-xl px-4 text-sm text-muted-foreground transition-colors duration-(--motion-hover) hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          >
            重設
          </button>
          <button
            type="submit"
            disabled={!canApply}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-foreground text-sm font-bold text-background press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-35"
          >
            <ArrowUp className="icon-sm" aria-hidden="true" />
            {isApplying ? "套用中…" : "套用"}
          </button>
        </div>
      </form>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>放棄這次編輯？</AlertDialogTitle>
            <AlertDialogDescription>塗抹的區域與輸入的指示都不會保留。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>繼續編輯</AlertDialogCancel>
            <AlertDialogAction onClick={requestClose}>放棄</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </M.div>
  );
}
