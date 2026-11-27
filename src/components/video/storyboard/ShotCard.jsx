import React, { useRef, useState } from "react";
import { Minus, Plus, Trash2, Upload, X } from "@/components/icons/lucideControls";
import { Image, ImagePlus, Mic, Scissors, Sparkles } from "@/components/icons/lucideContent";
import { AlertTriangle, Loader2 } from "@/components/icons/lucideStatus";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SelectField } from "@/components/ui/select-field";
import { imageJobImageUrl } from "@/services/imageChatService";
import {
  ANGLE_LABELS,
  CAMERA_LABELS,
  MAX_NARRATION_LENGTH,
  MAX_ON_SCREEN_LINE_LENGTH,
  MAX_ON_SCREEN_LINES,
  SHOT_SIZE_LABELS,
  estimateNarrationSeconds,
  isImageShot,
  isScriptShot,
  shotMaxSeconds,
  toOptions,
} from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";
import ReferenceStrip from "./ReferenceStrip";

const SHOT_SIZE_OPTIONS = toOptions(SHOT_SIZE_LABELS);
const ANGLE_OPTIONS = toOptions(ANGLE_LABELS);
const CAMERA_OPTIONS = toOptions(CAMERA_LABELS);
const SCRIPT_LIMIT = 2500;

const iconButton =
  "flex size-7 items-center justify-center rounded-lg text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";

const selectClass = "h-7 w-auto min-w-0 gap-1 rounded-lg px-2 text-xs";

function DurationStepper({ value, max, onChange, label }) {
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
        disabled={value >= max}
        aria-label={`${label}增加 1 秒`}
      >
        <Plus className="size-3.5" aria-hidden="true" />
      </button>
    </span>
  );
}

function ImageShotPicker({ shot, label, previews, imageHistory, busy, onUpload, onChange }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  const previewUrl = shot.imageJobId
    ? imageJobImageUrl(shot.imageJobId)
    : shot.uploadId
      ? previews[shot.uploadId] || ""
      : "";
  const hasImage = Boolean(shot.uploadId || shot.imageJobId);

  const handleFile = async (file) => {
    if (!file || !onUpload) return;
    setUploading(true);
    setUploadError("");
    try {
      await onUpload(file);
    } catch (error) {
      setUploadError(error.message || "靜態圖片上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative col-start-2 space-y-2">
      {hasImage ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-2">
          {previewUrl ? (
            <img src={previewUrl} alt={`${label}靜態圖幕預覽`} className="h-16 w-28 shrink-0 rounded-lg bg-black/10 object-cover" />
          ) : (
            <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Image className="size-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium text-foreground">
              {shot.imageJobId ? "已選取素材庫圖片" : "已上傳靜態圖片"}
            </p>
            <p className="text-[11px] text-muted-foreground">將以靜態圖幕顯示 {shot.duration} 秒，不消耗影片生成額度。</p>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <button
                type="button"
                disabled={busy || uploading}
                onClick={() => fileRef.current?.click()}
                className="inline-flex h-6.5 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Upload className="size-3" aria-hidden="true" />更換圖片
              </button>
              <button
                type="button"
                disabled={busy || uploading}
                onClick={() => onChange({ uploadId: null, imageJobId: null })}
                className="inline-flex h-6.5 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <X className="size-3" aria-hidden="true" />移除
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5 text-xs">
          <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-muted-foreground">請選擇一張圖片作為靜態圖幕（支援簡報頁、圖表、海報）</span>
          <button
            type="button"
            disabled={busy || uploading || !onUpload}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {uploading ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Upload className="size-3.5" aria-hidden="true" />}
            上傳圖片
          </button>
          {imageHistory.length > 0 && (
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={busy || uploading}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Image className="size-3.5" aria-hidden="true" />從素材庫挑選
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-2">
                <p className="mb-2 px-1 text-xs font-medium text-muted-foreground">選擇已生成的圖片</p>
                <div className="grid max-h-56 grid-cols-3 gap-1.5 overflow-y-auto custom-scrollbar">
                  {imageHistory.slice(0, 18).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onChange({ imageJobId: item.jobId, uploadId: null });
                        setPickerOpen(false);
                      }}
                      className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-muted press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title={item.userScript || "素材圖片"}
                    >
                      <img src={imageJobImageUrl(item.jobId)} alt={item.userScript || "素材圖片"} className="size-full object-cover" />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
      {uploadError && <p role="alert" className="text-xs text-destructive">{uploadError}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label={`${label}上傳靜態圖片`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          void handleFile(file);
        }}
      />
    </div>
  );
}

function NarrationAndOverlay({ shot, label, onChange }) {
  const narration = shot.narration || "";
  const onScreenText = shot.onScreenText || [];
  const hasContent = Boolean(narration.trim() || onScreenText.length > 0);
  const [expanded, setExpanded] = useState(hasContent);
  const isOpen = expanded || hasContent;
  const estSeconds = estimateNarrationSeconds(narration);
  const overNarration = narration.length > MAX_NARRATION_LENGTH;
  const textValue = onScreenText.join("\n");
  const linesCount = onScreenText.length;

  const handleOverlayChange = (raw) => {
    const next = raw
      .split(/\r?\n/)
      .slice(0, MAX_ON_SCREEN_LINES)
      .map((line) => line.slice(0, MAX_ON_SCREEN_LINE_LENGTH));
    onChange({ onScreenText: next.some((line) => line.trim()) ? next : [] });
  };

  if (!isOpen) {
    return (
      <div className="relative col-start-2 pt-0.5">
        <button
          type="button"
          className="inline-flex h-6.5 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground press-feedback hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded(true)}
        >
          <Mic className="size-3" aria-hidden="true" />加入旁白或畫面文字
        </button>
      </div>
    );
  }

  return (
    <div className="relative col-start-2 space-y-2 rounded-xl border border-border/70 bg-muted/25 p-2.5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-foreground">
            <Mic className="size-3 text-primary" aria-hidden="true" />旁白（中文配音）
          </span>
          <span className={cn("tabular-nums", overNarration && "font-medium text-destructive")}>
            {narration.length}/{MAX_NARRATION_LENGTH} 字{estSeconds > 0 ? ` · 預估約 ${estSeconds} 秒` : ""}
          </span>
        </div>
        <textarea
          value={narration}
          maxLength={MAX_NARRATION_LENGTH}
          rows={1}
          placeholder="輸入這一幕要朗讀的繁體中文旁白（留空則不配音）…"
          onChange={(event) => onChange({ narration: event.target.value })}
          className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs leading-relaxed field-sizing-content placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
          aria-label={`${label}旁白`}
        />
        {estSeconds > shot.duration && (
          <p className="text-[11px] tabular-nums text-amber-700 dark:text-amber-300">
            預估朗讀約 {estSeconds} 秒，超過目前 {shot.duration} 秒；送出時將依實際語音長度自動延長此幕。
          </p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">畫面文字（標題／重點）</span>
          <span className="tabular-nums">{linesCount}/{MAX_ON_SCREEN_LINES} 行</span>
        </div>
        <textarea
          value={textValue}
          rows={1}
          placeholder="可選：最多 4 行，每行 60 字內；由成片服務疊字呈現，不會扭曲閃爍"
          onChange={(event) => handleOverlayChange(event.target.value)}
          className="w-full resize-none rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs leading-relaxed field-sizing-content placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none"
          aria-label={`${label}畫面文字`}
        />
      </div>
    </div>
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
  previews = {},
  imageHistory = [],
  startFrameLocked = false,
  frame,
  onGenerateFrame,
  onUploadShotImage,
  onPromoteReference,
  onChange,
  onSetStartFrame,
  onToggleCharacter,
  onRewrite,
  onFix,
  onDelete,
  className,
}) {
  const label = `第 ${index + 1} 幕`;
  const script = isScriptShot(shot);
  const staticImage = isImageShot(shot);
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
      <span className={cn(
        "relative mt-0.5 flex size-6.5 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
        staticImage ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "bg-muted"
      )}>
        {index + 1}
      </span>
      <div className="relative flex min-w-0 flex-wrap items-center gap-1.5">
        {!script && (
          <div role="group" aria-label={`${label}畫面來源`} className="inline-flex h-7 items-center rounded-lg bg-muted p-0.5">
            <button
              type="button"
              aria-pressed={!staticImage}
              onClick={() => onChange({ source: "generate" })}
              className={cn(
                "h-6 rounded-md px-2 text-[11px] press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !staticImage ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              動態生成
            </button>
            <button
              type="button"
              aria-pressed={staticImage}
              onClick={() => onChange({ source: "image" })}
              className={cn(
                "h-6 rounded-md px-2 text-[11px] press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                staticImage ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              靜態圖幕
            </button>
          </div>
        )}
        {script ? (
          <span className="min-w-0 truncate text-sm font-medium">{shot.title || "腳本幕"}</span>
        ) : !staticImage && (
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
          {index > 0 && !staticImage && (
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
          <DurationStepper value={shot.duration} max={shotMaxSeconds(shot)} onChange={(duration) => onChange({ duration })} label={label} />
          {!script && !staticImage && (
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

      {staticImage ? (
        <ImageShotPicker
          shot={shot}
          label={label}
          previews={previews}
          imageHistory={imageHistory}
          busy={busy}
          onUpload={onUploadShotImage}
          onChange={onChange}
        />
      ) : script ? (
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

      {!staticImage && characters.length > 0 && (
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

      {!staticImage && shot.references.length > 0 && (
        <ReferenceStrip
          shot={shot}
          index={index}
          label={label}
          previews={previews}
          startFrameLocked={startFrameLocked}
          busy={busy}
          characters={characters}
          frame={frame}
          onGenerateFrame={onGenerateFrame}
          onPromoteReference={onPromoteReference}
          onSetStartFrame={onSetStartFrame}
        />
      )}

      <NarrationAndOverlay shot={shot} label={label} onChange={onChange} />

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
