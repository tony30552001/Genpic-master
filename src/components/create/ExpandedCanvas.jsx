import React, { useEffect, useId, useRef, useState } from "react";
import * as M from "motion/react-m";
import { ArrowLeft } from "@/components/icons/lucideControls";
import { Button } from "@/components/ui/button";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";
import RefineForm from "./RefineForm";
import VersionStrip from "./VersionStrip";

const COMPARE_MODES = [
  { id: "hold", label: "按住看原圖" },
  { id: "slider", label: "前後滑桿" },
];
const SLIDER_STEP = 5;
const HISTORY_MARK = "pixoraExpandedCanvas";

/** Leaves through the canvas's own history entry so back and close stay in sync. */
const closeCanvas = (onCloseRef) => {
  if (window.history.state?.[HISTORY_MARK]) window.history.back();
  else onCloseRef.current();
};

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

function VersionChip({ children, className }) {
  return (
    <span className={cn("pointer-events-none absolute rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-foreground shadow-sm", className)}>
      {children}
    </span>
  );
}

function HoldCompare({ before, after, beforeLabel, afterLabel }) {
  const [showBefore, setShowBefore] = useState(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== " " || event.repeat || isTypingTarget(event.target)) return;
      event.preventDefault();
      setShowBefore(true);
    };
    const onKeyUp = (event) => {
      if (event.key === " ") setShowBefore(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const holdHandlers = {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setShowBefore(true);
    },
    onPointerUp: () => setShowBefore(false),
    onPointerCancel: () => setShowBefore(false),
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center gap-3">
      <div className="relative flex min-h-0 flex-1 touch-none select-none items-center justify-center" {...holdHandlers} data-hold-compare>
        <img
          src={showBefore ? before : after}
          alt={showBefore ? `${beforeLabel}（原圖）` : afterLabel}
          className="max-h-full max-w-full rounded-lg object-contain shadow-xl"
          draggable={false}
        />
        <VersionChip className="left-2 top-2">{showBefore ? `${beforeLabel} 原圖` : afterLabel}</VersionChip>
      </div>
      <Button type="button" variant="outline" size="sm" className="touch-none select-none" {...holdHandlers}>
        按住比較（或按住空白鍵）
      </Button>
    </div>
  );
}

function SliderCompare({ before, after, beforeLabel, afterLabel }) {
  const frameRef = useRef(null);
  const [position, setPosition] = useState(50);

  const moveTo = (clientX) => {
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const onKeyDown = (event) => {
    const next = {
      ArrowLeft: position - SLIDER_STEP,
      ArrowDown: position - SLIDER_STEP,
      ArrowRight: position + SLIDER_STEP,
      ArrowUp: position + SLIDER_STEP,
      Home: 0,
      End: 100,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPosition(Math.min(100, Math.max(0, next)));
  };

  return (
    <div ref={frameRef} className="relative max-h-full touch-none select-none" data-slider-compare>
      <img src={after} alt={afterLabel} className="block max-h-[calc(100dvh-20rem)] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
      <img
        src={before}
        alt={`${beforeLabel}（原圖）`}
        className="absolute inset-0 h-full w-full rounded-lg object-contain"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        draggable={false}
      />
      <VersionChip className="left-2 top-2">{beforeLabel} 原圖</VersionChip>
      <VersionChip className="right-2 top-2">{afterLabel}</VersionChip>
      <div
        role="slider"
        tabIndex={0}
        aria-label="前後比較位置"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`左側顯示 ${beforeLabel} 原圖 ${Math.round(position)}%`}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture?.(event.pointerId);
          moveTo(event.clientX);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId)) moveTo(event.clientX);
        }}
        className="absolute inset-y-0 -ml-5 flex w-10 cursor-ew-resize justify-center focus-visible:outline-none [&:focus-visible>span]:ring-2 [&:focus-visible>span]:ring-ring"
        style={{ left: `${position}%` }}
      >
        <span className="h-full w-1 rounded-full bg-background shadow-[0_0_0_1px_hsl(var(--foreground)/0.25)]" />
      </div>
    </div>
  );
}

/**
 * Full-workspace canvas grown from the preview: compares a version with the one
 * it was refined from and keeps the refine row at hand. Closing (Esc, the
 * button or browser back) shrinks it back to where it came from.
 */
export default function ExpandedCanvas({
  origin,
  version,
  parent,
  getVersionLabel,
  onClose,
  isRefining,
  refineError,
  onRefine,
  refineDisabled,
  generationStatus,
  versionRows,
  activeVersionId,
  onSelectVersion,
  getVersion,
}) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const [mode, setMode] = useState("hold");
  const label = getVersionLabel(version);
  const parentLabel = parent ? getVersionLabel(parent) : "";
  const versionCount = versionRows.reduce((count, row) => count + row.items.length, 0);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // The canvas owns one history entry so the browser back button closes it.
  useEffect(() => {
    const returnFocusTo = document.activeElement;
    if (!window.history.state?.[HISTORY_MARK]) {
      window.history.pushState({ ...window.history.state, [HISTORY_MARK]: true }, "");
    }
    const onPopState = () => onCloseRef.current();
    window.addEventListener("popstate", onPopState);
    closeButtonRef.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, []);

  const requestClose = () => closeCanvas(onCloseRef);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeCanvas(onCloseRef);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const Compare = mode === "slider" ? SliderCompare : HoldCompare;

  return (
    <M.div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{ transformOrigin: `${origin.x}px ${origin.y}px` }}
      initial={{ opacity: 0, scale: origin.scale }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: origin.scale, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      data-expanded-canvas
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Button ref={closeButtonRef} type="button" variant="outline" size="sm" onClick={requestClose}>
          <ArrowLeft className="icon-sm" aria-hidden="true" /> 關閉
        </Button>
        <h2 id={titleId} className="text-sm font-semibold text-foreground">{label}</h2>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {parent ? `由 ${parentLabel} 修改：「${version.instruction}」` : "原始生成"}
        </span>
        {parent && (
          <div className="flex gap-1 rounded-lg border border-border/70 bg-muted/70 p-1" role="group" aria-label="比較方式">
            {COMPARE_MODES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={mode === option.id}
                onClick={() => setMode(option.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs transition-colors duration-(--motion-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === option.id ? "bg-background font-semibold text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6" aria-busy={isRefining}>
        {parent ? (
          <Compare
            key={`${version.id}-${mode}`}
            before={parent.imageUrl}
            after={version.imageUrl}
            beforeLabel={parentLabel}
            afterLabel={label}
          />
        ) : (
          <img src={version.imageUrl} alt={label} className="max-h-full max-w-full rounded-lg object-contain shadow-xl" />
        )}
        {isRefining && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/60 text-center" role="status">
            <p className="text-sm font-semibold text-foreground">{generationStatus?.label || "AI 正在修改"}</p>
            {generationStatus?.helperText && (
              <p className="px-4 text-xs text-muted-foreground">{generationStatus.helperText}</p>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto mb-4 w-[min(calc(100%-2rem),56rem)] space-y-3 rounded-2xl border border-border/60 bg-card/75 p-3 shadow-xl backdrop-blur-xl [@media(prefers-reduced-transparency:reduce)]:bg-card [@media(prefers-reduced-transparency:reduce)]:backdrop-blur-none">
        <RefineForm onRefine={onRefine} isRefining={isRefining} disabled={refineDisabled} refineError={refineError} />
        {versionCount > 1 && (
          <VersionStrip
            rows={versionRows}
            activeVersionId={activeVersionId}
            onSelectVersion={onSelectVersion}
            getVersionLabel={getVersionLabel}
            getVersion={getVersion}
          />
        )}
      </div>
    </M.div>
  );
}
