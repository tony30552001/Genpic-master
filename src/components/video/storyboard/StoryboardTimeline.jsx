import React, { useId, useLayoutEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { isImageShot, segmentStartLabel } from "@/lib/videoStoryboard";

const previewOrder = (shots, move) => {
  if (!move || move.from === move.to) return shots;
  const ordered = [...shots];
  const from = ordered.findIndex((item) => item.id === move.from);
  const to = ordered.findIndex((item) => item.id === move.to);
  if (from >= 0 && to >= 0) ordered.splice(to, 0, ordered.splice(from, 1)[0]);
  return ordered;
};

/** Tap to edit, drag to move, or use the sort mode to select two positions without dragging. */
export default function StoryboardTimeline({ shots, segments, warnedIds, changedIds, onJump, onReorder, busy, compact, previews = {} }) {
  const [sorting, setSorting] = useState(false);
  const [selected, setSelected] = useState(null);
  const [move, setMove] = useState(null);
  const [announcement, setAnnouncement] = useState("");
  const instructions = useId();
  const row = useRef(null);
  const pointer = useRef(null);
  const ignoreClick = useRef(false);
  const positions = useRef(new Map());
  const reduceMotion = useReducedMotion();
  const ordered = previewOrder(shots, move);
  const canSort = !busy && shots.length > 1;
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const dynamicShotIds = ordered.filter((s) => !isImageShot(s)).map((s) => s.id).join("|");
  const hasStaticShots = ordered.some((s) => isImageShot(s));
  // Never show obsolete inspection groups while an edit is being inspected.
  const groups = segments?.length && segments.flatMap((s) => s.shotIds).join("|") === dynamicShotIds
    && (segments.length > 1 || hasStaticShots)
    ? segments
    : [];

  useLayoutEffect(() => {
    const next = new Map();
    for (const button of row.current.children) {
      const id = button.dataset.shot;
      next.set(id, button.offsetLeft);
      const previous = positions.current.get(id);
      if (!reduceMotion && previous != null && previous !== button.offsetLeft) {
        animate(button, { x: [previous - button.offsetLeft, 0] }, { type: "spring", bounce: 0, duration: 0.28 });
      }
    }
    positions.current = next;
  }, [ordered, reduceMotion]);

  const commit = (from, to) => {
    setSelected(null);
    if (canSort && from !== to) setAnnouncement(onReorder(from, to));
  };
  const down = (event, shotId) => {
    ignoreClick.current = false;
    if (!canSort || event.button !== 0 || !event.isPrimary || (compact && event.pointerType === "touch" && !sorting)) return;
    const bounds = [...row.current.children].map((button) => ({
      id: button.dataset.shot, left: button.offsetLeft, right: button.offsetLeft + button.offsetWidth,
    }));
    pointer.current = { id: event.pointerId, x: event.clientX, bounds, from: shotId, to: shotId, dragging: false };
  };
  const drag = (event) => {
    const state = pointer.current;
    if (!state || state.id !== event.pointerId) return;
    if (!state.dragging && Math.abs(event.clientX - state.x) < 5) return;
    if (!state.dragging) {
      // Capture on the stable track: moving a keyed button can release its pointer capture.
      row.current.setPointerCapture(event.pointerId);
      state.dragging = true;
    }
    const x = event.clientX - row.current.getBoundingClientRect().left;
    const target = state.bounds.find((item) => x <= item.right) || state.bounds.at(-1);
    state.to = target.id;
    setMove({ from: state.from, to: state.to });
  };
  const release = (event, cancel = false) => {
    const state = pointer.current;
    if (!state || state.id !== event.pointerId) return;
    pointer.current = null;
    ignoreClick.current = state.dragging || cancel;
    setMove(null);
    if (state.dragging && !cancel) commit(state.from, state.to);
  };
  const click = (id) => {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (!sorting || !canSort) return onJump(id);
    if (selected) commit(selected, id);
    else setSelected(id);
  };
  const keyDown = (event, id) => {
    ignoreClick.current = false;
    if (event.key === "Escape") {
      pointer.current = null;
      setMove(null);
      setSelected(null);
      setSorting(false);
      return;
    }
    if (!canSort || (!sorting && !event.altKey) || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const target = shots[shots.findIndex((item) => item.id === id) + (event.key === "ArrowRight" ? 1 : -1)];
    if (target) commit(id, target.id);
  };
  return (
    <div className={compact ? "px-4 pb-2" : "sticky top-0 z-10 -mx-5 bg-card/95 px-5 pb-2 pt-3 backdrop-blur-md"}>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span id={instructions} className="min-w-0 flex-1">
          {sorting ? (selected ? "點選目的位置" : "拖曳、依序點兩幕，或按左右鍵移動") : (compact ? "點選分鏡以編輯" : "點選以編輯，拖曳或按 Alt＋左右鍵排序")}
        </span>
        <button type="button" className="min-h-7 rounded px-2 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          disabled={!canSort} aria-pressed={sorting} onClick={() => { setSorting(!sorting); setSelected(null); }}>
          {sorting ? "完成排序" : "調整順序"}
        </button>
      </div>
      <div className="overflow-x-auto p-1 -mx-1 custom-scrollbar">
        <div ref={row} className="relative flex gap-1" role="group" aria-label="分鏡時間軸"
          onPointerMove={drag} onPointerUp={(event) => release(event)} onPointerCancel={(event) => release(event, true)}
          onLostPointerCapture={(event) => { if (event.target === row.current) release(event, true); }}
          onPointerLeave={() => { if (!pointer.current?.dragging) pointer.current = null; }}>
          {ordered.map((shot, index) => {
            const segment = groups.find((item) => item.shotIds.includes(shot.id));
            const staticShot = isImageShot(shot);
            const hasNarration = Boolean((shot.narration || "").trim());
            const preview = compact && previews[shot.uploadId || shot.startFrameUploadId || shot.references?.[0]?.uploadId];
            return (
              <button key={shot.id} data-shot={shot.id} type="button" style={{ flexGrow: shot.duration }}
                className={cn(
                  "relative basis-0 select-none overflow-hidden whitespace-nowrap rounded-lg border text-[11px] font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  staticShot
                    ? "border-sky-500/35 bg-sky-500/12 text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                    : "border-primary/25 bg-primary/12 text-primary hover:bg-primary/20",
                  compact ? "h-11 min-w-12" : "h-9 min-w-7",
                  sorting || !compact ? "touch-none" : "touch-pan-x",
                  canSort && "cursor-grab active:cursor-grabbing",
                  (changedIds.includes(shot.id) || selected === shot.id) && (staticShot ? "bg-sky-500/25" : "bg-primary/25"),
                  move?.from === shot.id && "z-10 border-primary shadow-md motion-safe:scale-[1.02]",
                  segment?.index > 0 && segment.shotIds[0] === shot.id && "ml-1.5"
                )}
                onPointerDown={(event) => down(event, shot.id)}
                onClick={() => click(shot.id)} onKeyDown={(event) => keyDown(event, shot.id)}
                aria-pressed={sorting ? selected === shot.id : undefined}
                aria-describedby={instructions}
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                aria-label={`第 ${index + 1} 幕${staticShot ? "（靜態圖幕）" : ""}，約 ${shot.duration} 秒${segment ? `，屬於第 ${segment.index + 1} 段` : ""}${hasNarration ? "，含旁白" : ""}${warnedIds.has(shot.id) ? "，有提醒" : ""}`}>
                {preview && <img src={preview} alt="" draggable={false} className="absolute inset-0 size-full object-cover opacity-25" />}
                <span className="relative">{staticShot ? "圖 " : ""}{index + 1} · {shot.duration}s</span>
                {hasNarration && <span className="absolute bottom-1 left-1 size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />}
                {warnedIds.has(shot.id) && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between gap-2 text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
          {groups.length ? groups.map((segment) => (
            <span key={segment.index} className="min-w-0 basis-0 truncate" style={{ flexGrow: segment.durationSeconds }} title={segmentStartLabel(segment)}>
              第 {segment.index + 1} 段 · {segment.durationSeconds}s{segment.index > 0 && ` · ${segment.chained ? "接續" : "新場景"}`}
            </span>
          )) : <><span>0s</span><span>{total}s</span></>}
        </div>
      )}
      <p role="status" className="text-[11px] text-muted-foreground">{announcement}</p>
    </div>
  );
}
