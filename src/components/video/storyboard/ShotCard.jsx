import React, { useState } from "react";
import { Minus, Plus, Trash2 } from "@/components/icons/lucideControls";
import { Scissors, Sparkles } from "@/components/icons/lucideContent";
import { AlertTriangle, Loader2 } from "@/components/icons/lucideStatus";
import { SelectField } from "@/components/ui/select-field";
import {
  ANGLE_LABELS,
  CAMERA_LABELS,
  MAX_SHOT_SECONDS,
  SHOT_SIZE_LABELS,
  isScriptShot,
  toOptions,
} from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";

const SHOT_SIZE_OPTIONS = toOptions(SHOT_SIZE_LABELS);
const ANGLE_OPTIONS = toOptions(ANGLE_LABELS);
const CAMERA_OPTIONS = toOptions(CAMERA_LABELS);
const SCRIPT_LIMIT = 2500;

const iconButton =
  "flex size-7 items-center justify-center rounded-lg text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

const selectClass = "h-7 w-auto min-w-0 gap-1 rounded-lg px-2 text-xs";

function DurationStepper({ value, onChange, label }) {
  return (
    <span className="inline-flex h-7 items-center rounded-lg border border-border tabular-nums">
      <button
        type="button"
        className={iconButton}
        onClick={() => onChange(value - 1)}
        disabled={value <= 1}
        aria-label={`${label}減少 1 秒`}
      >
        <Minus className="size-3.5" aria-hidden="true" />
      </button>
      <span className="min-w-12 text-center text-xs">約 {value} 秒</span>
      <button
        type="button"
        className={iconButton}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_SHOT_SECONDS}
        aria-label={`${label}增加 1 秒`}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function ScriptBody({ shot, label, onChange, onCondense, busy, fill }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const over = shot.script.length > SCRIPT_LIMIT;
  return (
    <>
      <textarea
        value={shot.script}
        onChange={(event) => onChange({ script: event.target.value })}
        className={cn(
          "col-start-2 w-full resize-none bg-transparent py-0.5 text-sm leading-relaxed field-sizing-content focus-visible:outline-none",
          !fill && "max-h-60"
        )}
        aria-label={`${label}腳本`}
      />
      <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className={cn("tabular-nums", over && "font-medium text-destructive")}>
          {shot.script.length} / {SCRIPT_LIMIT} 字
        </span>
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-1 font-medium text-primary press-feedback disabled:opacity-50"
          onClick={onCondense}
          disabled={busy}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />AI 濃縮
        </button>
        {shot.scriptOriginal && (
          <>
            <button
              type="button"
              className="font-medium text-primary press-feedback"
              onClick={() => setShowOriginal((value) => !value)}
              aria-expanded={showOriginal}
            >
              {showOriginal ? "收起原文" : "查看原文"}
            </button>
            <button
              type="button"
              className="font-medium text-primary press-feedback"
              onClick={() => onChange({ script: shot.scriptOriginal, scriptOriginal: null })}
            >
              還原原文
            </button>
          </>
        )}
      </div>
      {shot.scriptOriginal && (
        <div
          className={cn(
            "col-start-2 grid transition-[grid-template-rows] duration-(--motion-enter) ease-emphasized",
            showOriginal ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
          )}
          inert={!showOriginal}
        >
          <div className="overflow-hidden">
            <p className="whitespace-pre-wrap rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {shot.scriptOriginal}
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One storyboard shot. Structured shots edit shot size, angle, camera, action
 * and environment; script shots edit the user's script text. `fill` drops the
 * height caps for the phone's full-screen editor.
 */
export default function ShotCard({
  shot,
  index,
  warnings = [],
  notes = [],
  changed = false,
  flashKey = 0,
  busy = false,
  rewriting = false,
  canDelete = true,
  fill = false,
  characters = [],
  onChange,
  onToggleCharacter,
  onRewrite,
  onFix,
  onDelete,
  className,
}) {
  const label = `第 ${index + 1} 幕`;
  const script = isScriptShot(shot);
  const cameraConflict = warnings.some((warning) => warning.code === "camera_conflict");

  return (
    <article
      id={`storyboard-shot-${shot.id}`}
      className={cn(
        "relative grid scroll-mt-28 grid-cols-[28px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 overflow-hidden rounded-2xl border border-border bg-card py-2.5 pl-3 pr-2.5 transition-[border-color,box-shadow] duration-(--motion-hover) focus-within:border-primary",
        !fill && "storyboard-enter",
        changed && "shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]",
        className
      )}
      style={{ "--i": index }}
      aria-label={label}
      aria-busy={rewriting || undefined}
    >
      {changed && <span key={flashKey} className="storyboard-flash pointer-events-none absolute inset-0" aria-hidden="true" />}
      <span className="relative mt-0.5 flex size-6.5 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
        {index + 1}
      </span>
      <div className="relative flex min-w-0 flex-wrap items-center gap-1.5">
        {script ? (
          <span className="min-w-0 truncate text-sm font-medium">{shot.title || "腳本幕"}</span>
        ) : (
          <>
            <SelectField
              aria-label={`${label}景別`}
              value={shot.shotSize}
              onValueChange={(value) => onChange({ shotSize: value })}
              options={SHOT_SIZE_OPTIONS}
              className={selectClass}
            />
            <SelectField
              aria-label={`${label}角度`}
              value={shot.angle}
              onValueChange={(value) => onChange({ angle: value })}
              options={ANGLE_OPTIONS}
              className={selectClass}
            />
            <SelectField
              aria-label={`${label}運鏡`}
              value={shot.camera}
              onValueChange={(value) => onChange({ camera: value })}
              options={CAMERA_OPTIONS}
              className={cn(selectClass, cameraConflict && "border-amber-500 text-amber-700 dark:text-amber-300")}
            />
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          {index > 0 && (
            <button
              type="button"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-xs press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                shot.cut
                  ? "border-primary/40 bg-primary/10 font-medium text-primary"
                  : "border-dashed border-border text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onChange({ cut: !shot.cut })}
              aria-pressed={shot.cut}
              aria-label={`${label}場景轉換`}
              title={shot.cut ? "這一幕換到新場景，從新的一段開始" : "設為場景轉換：這一幕從新的一段開始，不接續上一幕畫面"}
            >
              <Scissors className="size-3.5" aria-hidden="true" />場景轉換
            </button>
          )}
          <DurationStepper value={shot.duration} onChange={(duration) => onChange({ duration })} label={label} />
          {!script && (
            <button
              type="button"
              className={iconButton}
              onClick={() => onRewrite("rewrite")}
              disabled={busy}
              aria-label={`請 AI 重寫${label}`}
              title="請 AI 重寫這一幕"
            >
              {rewriting
                ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                : <Sparkles className="size-3.5" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            className={iconButton}
            onClick={onDelete}
            disabled={!canDelete || busy}
            aria-label={`刪除${label}`}
            title="刪除這一幕"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>

      {script ? (
        <ScriptBody
          shot={shot}
          label={label}
          onChange={onChange}
          onCondense={() => onRewrite("condense")}
          busy={busy}
          fill={fill}
        />
      ) : (
        <>
          <textarea
            value={shot.action}
            onChange={(event) => onChange({ action: event.target.value })}
            placeholder="這一幕發生什麼動作？"
            maxLength={1000}
            rows={1}
            className={cn(
              "relative col-start-2 w-full resize-none bg-transparent py-0.5 text-sm leading-relaxed field-sizing-content placeholder:text-muted-foreground focus-visible:outline-none",
              fill ? "min-h-24 rounded-lg border border-border px-2.5 py-2 text-[15px]" : "max-h-28"
            )}
            aria-label={`${label}動作`}
          />
          <label className="relative col-start-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            環境
            <input
              value={shot.environment}
              onChange={(event) => onChange({ environment: event.target.value })}
              placeholder="（沿用全片設定）"
              maxLength={500}
              className="h-7 min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              aria-label={`${label}環境`}
            />
          </label>
        </>
      )}

      {characters.length > 0 && (
        <div className="relative col-start-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={`${label}出場角色`}>
          {characters.map((character) => {
            const on = shot.characterIds.includes(character.id);
            return (
              <button
                key={character.id}
                type="button"
                className={cn(
                  "inline-flex h-6.5 max-w-40 items-center rounded-full border px-2.5 text-xs press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on
                    ? "border-primary/40 bg-primary/10 font-medium text-primary"
                    : "border-dashed border-border text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onToggleCharacter(character.id)}
                aria-pressed={on}
              >
                <span className="truncate">@{character.name || "未命名"}</span>
              </button>
            );
          })}
        </div>
      )}

      {changed && (
        <span className="relative col-start-2 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          AI 已修改
        </span>
      )}

      {notes.length > 0 && (
        <ul className="relative col-start-2 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          {notes.map((note) => <li key={note}>・{note}</li>)}
        </ul>
      )}

      {warnings.map((warning) => (
        <div
          key={warning.code}
          className="relative col-start-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{warning.message}</span>
          <button
            type="button"
            className="shrink-0 rounded font-semibold press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            onClick={() => onFix(warning)}
            disabled={busy}
          >
            請 AI 修正
          </button>
        </div>
      ))}
    </article>
  );
}
