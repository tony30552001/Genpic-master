import React, { useId, useState } from "react";
import { ChevronDown, Plus, X } from "@/components/icons/lucideControls";
import { SelectField } from "@/components/ui/select-field";
import { DEFAULT_SPEECH_VOICES, TRANSITION_LABELS, toOptions } from "@/lib/videoStoryboard";
import { cn } from "@/lib/utils";

const MAX_CONSTRAINTS = 8;
const TRANSITION_OPTIONS = toOptions(TRANSITION_LABELS);

const fieldClass =
  "h-8 w-full min-w-0 rounded-lg border border-border bg-transparent px-2.5 text-[13px] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:outline-none";

/** Whole-video settings (style, lighting, consistency, negative, narration & output) as a collapsible card; `children` renders below them. */
export default function GlobalCard({ global, speech = null, hasNarration = false, onChange, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [draftConstraint, setDraftConstraint] = useState("");
  const id = useId();
  const characterCount = global.characters.length;
  const voices = speech?.voices?.length ? speech.voices : DEFAULT_SPEECH_VOICES;
  const selectedVoice = global.voice || speech?.defaultVoice || voices[0].id;
  const transition = global.transition || "cut";
  const speechUnconfigured = speech != null && !speech.configured;
  const summary =
    [
      global.style,
      global.lighting,
      characterCount ? `${characterCount} 個角色` : "",
      global.subtitles ? "燒錄字幕" : "",
      transition === "fade" ? "淡化轉場" : "",
    ].filter(Boolean).join(" · ") || "尚未設定";

  const addConstraint = () => {
    const text = draftConstraint.trim();
    if (!text || global.constraints.length >= MAX_CONSTRAINTS) return;
    onChange({ constraints: [...global.constraints, text] });
    setDraftConstraint("");
  };

  return (
    <section className="storyboard-enter shrink-0 rounded-2xl border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={`${id}-body`}
      >
        全片設定
        <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">{summary}</span>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-(--motion-enter) ease-emphasized",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={`${id}-body`}
        className={cn(
          "grid transition-[grid-template-rows] duration-(--motion-enter) ease-emphasized",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
        inert={!open}
      >
        <div className="overflow-hidden">
          <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-2.5 gap-y-2 px-3 pb-3 text-xs">
            <label htmlFor={`${id}-style`} className="text-muted-foreground">風格</label>
            <input
              id={`${id}-style`}
              className={fieldClass}
              value={global.style}
              maxLength={300}
              placeholder="例如：溫暖寫實、電影感"
              onChange={(event) => onChange({ style: event.target.value })}
            />
            <label htmlFor={`${id}-light`} className="text-muted-foreground">光線</label>
            <input
              id={`${id}-light`}
              className={fieldClass}
              value={global.lighting}
              maxLength={300}
              placeholder="例如：清晨側光、暖色調"
              onChange={(event) => onChange({ lighting: event.target.value })}
            />
            <span className="self-start pt-1.5 text-muted-foreground">保持一致</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {global.constraints.map((item, index) => (
                <span key={`${item}-${index}`} className="inline-flex h-6.5 max-w-full items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-xs">
                  <span className="truncate">{item}</span>
                  <button
                    type="button"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground press-feedback hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onChange({ constraints: global.constraints.filter((_, i) => i !== index) })}
                    aria-label={`移除「${item}」`}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              {global.constraints.length < MAX_CONSTRAINTS && (
                <span className="inline-flex h-6.5 min-w-32 flex-1 items-center gap-1 rounded-full border border-dashed border-border pl-2.5 pr-1 focus-within:border-primary">
                  <input
                    value={draftConstraint}
                    maxLength={200}
                    onChange={(event) => setDraftConstraint(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        addConstraint();
                      }
                    }}
                    placeholder="新增要保持一致的細節"
                    className="min-w-0 flex-1 bg-transparent text-xs placeholder:text-muted-foreground focus-visible:outline-none"
                    aria-label="新增保持一致的細節"
                  />
                  <button
                    type="button"
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground press-feedback hover:bg-muted hover:text-foreground disabled:opacity-40"
                    onClick={addConstraint}
                    disabled={!draftConstraint.trim()}
                    aria-label="加入"
                  >
                    <Plus className="size-3" aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>
            <label htmlFor={`${id}-negative`} className="text-muted-foreground">避免</label>
            <input
              id={`${id}-negative`}
              className={fieldClass}
              value={global.negative}
              maxLength={2500}
              placeholder="例如：blur, distort, low quality"
              onChange={(event) => onChange({ negative: event.target.value })}
            />
            <span className="text-muted-foreground">轉場</span>
            <SelectField
              aria-label="幕間轉場方式"
              className="h-8 text-xs"
              value={transition}
              onValueChange={(value) => onChange({ transition: value })}
              options={TRANSITION_OPTIONS}
            />
            <span className="text-muted-foreground">旁白語音</span>
            <div className="min-w-0 space-y-1">
              <SelectField
                aria-label="旁白語音"
                className="h-8 text-xs"
                value={selectedVoice}
                onValueChange={(value) => onChange({ voice: value })}
                options={voices.map((voice) => ({ value: voice.id, label: voice.label }))}
              />
              {speechUnconfigured && (
                <p className={cn("text-[11px] leading-snug", hasNarration ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
                  管理員尚未設定 Azure AI Speech；含旁白的分鏡需先完成語音設定才能合成。
                </p>
              )}
            </div>
            <span className="text-muted-foreground">字幕</span>
            <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={Boolean(global.subtitles)}
                onChange={(event) => onChange({ subtitles: event.target.checked })}
                className="size-4 accent-primary"
                aria-label="燒錄旁白字幕"
              />
              <span>依旁白時間軸燒錄繁中字幕（成片同時提供 .srt 下載）</span>
            </label>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

