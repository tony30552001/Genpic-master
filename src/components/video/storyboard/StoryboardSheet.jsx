import React, { useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import * as M from "motion/react-m";
import { ChevronDown, Plus, X } from "@/components/icons/lucideControls";
import { Clapperboard } from "@/components/icons/lucideContent";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import { characterModeLabel, isScriptShot, scriptImageLabels, segmentStarts, sendModeLabel, shotSummary, storyboardSeconds } from "@/lib/videoStoryboard";
import CharacterList from "./CharacterList";
import { cn } from "@/lib/utils";
import GlobalCard from "./GlobalCard";
import SegmentDivider from "./SegmentDivider";
import ShotCard from "./ShotCard";
import { StatusPill, StoryboardSkeleton } from "./StoryboardParts";
import { boardStatus, estimateLabel, storyboardActions } from "./storyboardActions";

const SHEET_SPRING = { type: "spring", bounce: 0, duration: 0.35 };
const HALF_RATIO = 0.45;
const DECELERATION = 0.998;

const project = (velocity) => ((velocity / 1000) * DECELERATION) / (1 - DECELERATION);

const rubberband = (overshoot, dimension, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));

/** Phone storyboard: a draggable sheet (half / full), dismissed by flicking down past half. */
export default function StoryboardSheet({ storyboard, model, canGenerate, generateBlocker, onGenerate, onClose }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const sheetRef = useRef(null);
  const drag = useRef(null);
  const reduceMotion = useReducedMotion();
  const requestClose = useHistoryLayer(onClose, closeButtonRef);
  // The sheet is 92dvh tall; start resting at the half detent.
  const [restingY, setRestingY] = useState(() => window.innerHeight * 0.92 * HALF_RATIO);
  const y = useMotionValue(restingY);
  const footerY = useTransform(y, (value) => -Math.max(0, value));
  const [editingId, setEditingId] = useState(null);
  const { board, pending } = storyboard;
  const actions = storyboardActions(storyboard);
  const warnedIds = useMemo(
    () => new Set((board?.warnings || []).map((warning) => warning.shotId)),
    [board?.warnings]
  );
  const editingShot = board?.storyboard.shots.find((shot) => shot.id === editingId) || null;

  const sheetHeight = () => sheetRef.current?.offsetHeight || window.innerHeight;
  const snapTo = (target, velocity = 0) => {
    setRestingY(target);
    animate(y, target, reduceMotion ? { duration: 0 } : { ...SHEET_SPRING, velocity });
  };

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    y.stop();
    drag.current = { startY: event.clientY, origin: y.get(), samples: [{ y: event.clientY, t: event.timeStamp }] };
  };

  const onPointerMove = (event) => {
    const state = drag.current;
    if (!state) return;
    const raw = state.origin + event.clientY - state.startY;
    y.set(raw < 0 ? rubberband(raw, sheetHeight()) : raw);
    state.samples = [...state.samples.slice(-4), { y: event.clientY, t: event.timeStamp }];
  };

  const onPointerUp = () => {
    const state = drag.current;
    if (!state) return;
    drag.current = null;
    const first = state.samples[0];
    const last = state.samples.at(-1);
    const velocity = last.t > first.t ? ((last.y - first.y) / (last.t - first.t)) * 1000 : 0;
    const height = sheetHeight();
    const half = height * HALF_RATIO;
    const projected = y.get() + project(velocity);
    if (projected > (half + height) / 2 && velocity >= 0) {
      requestClose();
      return;
    }
    snapTo(Math.abs(projected) < Math.abs(projected - half) ? 0 : half, velocity);
  };

  const seconds = board ? storyboardSeconds(board.storyboard) : 0;
  const startsAt = segmentStarts(board?.segments);
  const status = board ? boardStatus(storyboard) : { label: "AI 擬稿中", tone: "draft" };

  return (
    <M.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={requestClose}
        aria-label="關閉分鏡"
      />
      <M.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", transition: OVERLAY_EXIT }}
        transition={OVERLAY_ENTER}
        className="relative z-10"
      >
        <M.div
          ref={sheetRef}
          style={{ y }}
          className="flex h-[92dvh] flex-col rounded-t-2xl bg-card text-card-foreground shadow-2xl"
        >
          <div
            className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/30" aria-hidden="true" />
            <div className="flex items-center gap-2 px-4 pb-2 pt-1.5">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate text-base font-semibold">{board?.storyboard.title || "分鏡板"}</h2>
                {board && (
                  <p className="text-xs tabular-nums text-muted-foreground">{board.storyboard.shots.length} 幕 · {seconds} 秒</p>
                )}
              </div>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={requestClose}
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="關閉分鏡"
              >
                <ChevronDown className="icon-md" aria-hidden="true" />
              </button>
            </div>
            {board && (
              <div className="flex h-7 gap-0.75 px-4 pb-2" aria-hidden="true">
                {board.storyboard.shots.map((shot, index) => (
                  <span
                    key={shot.id}
                    style={{ flexGrow: shot.duration }}
                    className={cn(
                      "relative flex min-w-0 basis-0 items-center justify-center rounded-md bg-primary/12 text-[10px] font-semibold tabular-nums text-primary",
                      board.changedShotIds.includes(shot.id) && "bg-primary/25",
                      index > 0 && startsAt.has(shot.id) && "ml-1.5"
                    )}
                  >
                    {index + 1}
                    {warnedIds.has(shot.id) && <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-amber-500" />}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border px-4 py-3">
            {!board ? (
              <div role="status" aria-busy="true">
                <span className="sr-only">AI 正在擬分鏡</span>
                <StoryboardSkeleton count={4} className="[&>div]:h-16" />
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {board.reopened && (
                  <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
                    從影片重新開啟的分鏡；修改後會建立新的影片，原影片保留。
                  </p>
                )}
                <GlobalCard global={board.storyboard.global} onChange={actions.updateGlobal} defaultOpen={false}>
                  <CharacterList
                    characters={board.storyboard.global.characters}
                    imageLabels={scriptImageLabels(board.storyboard)}
                    actions={actions}
                  />
                </GlobalCard>
                {board.storyboard.shots.map((shot, index) => (
                  <React.Fragment key={shot.id}>
                  {startsAt.has(shot.id) && <SegmentDivider segment={startsAt.get(shot.id)} />}
                  <button
                    type="button"
                    style={{ "--i": index }}
                    className={cn(
                      "storyboard-enter flex min-h-16 w-full items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5 text-left press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      board.changedShotIds.includes(shot.id) && "border-primary/40"
                    )}
                    onClick={() => setEditingId(shot.id)}
                    aria-label={`編輯第 ${index + 1} 幕`}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="truncate">{shotSummary(shot)}</span>
                        <span className="shrink-0 tabular-nums">· {shot.duration} 秒</span>
                        {shot.characterIds.length > 0 && (
                          <span className="truncate text-primary">
                            {board.storyboard.global.characters
                              .filter((character) => shot.characterIds.includes(character.id))
                              .map((character) => `@${character.name}`)
                              .join(" ")}
                          </span>
                        )}
                        {warnedIds.has(shot.id) && <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-label="有提醒" />}
                      </span>
                      <span className="line-clamp-2 text-[13px]">{isScriptShot(shot) ? shot.script : shot.action || "尚未填寫動作"}</span>
                    </span>
                    {pending === `revise:${shot.id}` && (
                      <Loader2 className="mt-1 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
                    )}
                  </button>
                  </React.Fragment>
                ))}
                {actions.canAddShot && (
                  <button
                    type="button"
                    className="flex h-11 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-dashed border-border text-[13px] text-muted-foreground press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={actions.addShot}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />新增分鏡
                  </button>
                )}
              </div>
            )}
            {/* Lets the list scroll clear of the counter-translated footer at the half detent. */}
            <div style={{ height: restingY }} aria-hidden="true" />
          </div>

          {/* Counter-translated so the actions stay on screen at the half detent. */}
          <M.div style={{ y: footerY }} className="relative z-10 shrink-0 bg-card">
            <SheetFooter
              storyboard={storyboard}
              actions={actions}
              model={model}
              canGenerate={canGenerate}
              generateBlocker={generateBlocker}
              onGenerate={onGenerate}
            />
          </M.div>
        </M.div>
      </M.div>

      <AnimatePresence>
        {editingShot && (
          <ShotEditor
            key={editingShot.id}
            shot={editingShot}
            index={board.storyboard.shots.indexOf(editingShot)}
            board={board}
            pending={pending}
            actions={actions}
            onClose={() => setEditingId(null)}
          />
        )}
      </AnimatePresence>
    </M.div>
  );
}

function SheetFooter({ storyboard, actions, model, canGenerate, generateBlocker, onGenerate }) {
  const { board, pending, inspection } = storyboard;
  const characterMode = characterModeLabel(board?.segments, model?.family);
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t border-border px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {inspection.status === "invalid" && <p role="alert" className="text-xs text-destructive">{inspection.error}</p>}
      {characterMode && <p className="text-xs text-muted-foreground">{characterMode}</p>}
      <p className="truncate text-xs text-muted-foreground">{generateBlocker || `${sendModeLabel(board?.segments)} · ${estimateLabel(model, board?.segments?.length)}`}</p>
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => void actions.redraft()} disabled={!board || Boolean(pending)}>
          {pending === "revise" && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
          請 AI 重擬
        </Button>
        <Button type="button" className="h-11 flex-1 gap-1.5 rounded-xl" onClick={onGenerate} disabled={!canGenerate}>
          <Clapperboard aria-hidden="true" />確認並生成
        </Button>
      </div>
    </div>
  );
}

function ShotEditor({ shot, index, board, pending, actions, onClose }) {
  const closeButtonRef = useRef(null);
  const requestClose = useHistoryLayer(onClose, closeButtonRef);
  return (
    <M.div
      className="fixed inset-0 z-10 flex flex-col bg-background"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%", transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-label={`編輯第 ${index + 1} 幕`}
    >
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border px-2 pt-[env(safe-area-inset-top)]">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={requestClose}
          className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="完成編輯"
        >
          <X className="icon-md" aria-hidden="true" />
        </button>
        <h2 className="text-base font-semibold">第 {index + 1} 幕</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <ShotCard
          shot={shot}
          index={index}
          fill
          warnings={board.warnings.filter((warning) => warning.shotId === shot.id)}
          notes={board.shotNotes?.[shot.id] || []}
          changed={board.changedShotIds.includes(shot.id)}
          flashKey={board.revision}
          busy={Boolean(pending)}
          rewriting={pending === `revise:${shot.id}`}
          canDelete={board.storyboard.shots.length > 1}
          characters={board.storyboard.global.characters}
          previews={actions.previews}
          startFrameLocked={actions.startFrameLocked}
          onChange={(patch) => actions.updateShot(shot.id, patch)}
          onSetStartFrame={(uploadId) => actions.setStartFrame(shot.id, uploadId)}
          onToggleCharacter={(characterId) => actions.toggleShotCharacter(shot.id, characterId)}
          onRewrite={(mode) => void actions.rewriteShot(shot.id, mode)}
          onFix={(warning) => void actions.fixWarning(warning)}
          onDelete={() => {
            actions.deleteShot(shot.id);
            requestClose();
          }}
        />
      </div>
    </M.div>
  );
}
