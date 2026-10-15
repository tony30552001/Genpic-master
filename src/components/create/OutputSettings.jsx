import React from "react";
import {
  Monitor,
  Layout,
  Square,
  Smartphone,
} from "@/components/icons/lucideContent";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { IMAGE_QUALITY_LABELS } from "@/config";
import { LANGUAGE_OPTIONS, NO_TEXT_LANGUAGE } from "@/lib/imageTextLanguage";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 簡報", icon: Monitor },
  { id: "4:3", label: "4:3 傳統", icon: Layout },
  { id: "1:1", label: "1:1 社群", icon: Square },
  { id: "9:16", label: "9:16 手機", icon: Smartphone },
];

const PRIMARY_TEXT_LANGUAGES = ["zh-TW", NO_TEXT_LANGUAGE];
const OTHER_TEXT_LANGUAGES = LANGUAGE_OPTIONS.filter((option) => !PRIMARY_TEXT_LANGUAGES.includes(option.id));

const GROUP_CLASS = "flex gap-1 rounded-lg border border-border/70 bg-muted/70 p-1 shadow-inner";
const SEGMENT_CLASS =
  "min-h-11 touch-manipulation whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";
const SEGMENT_ACTIVE_CLASS = "bg-background text-primary font-semibold shadow-sm ring-1 ring-border/60";
const SEGMENT_IDLE_CLASS = "text-muted-foreground hover:bg-background/70 hover:text-foreground";

function TextModeControl({ imageLanguage, onImageLanguageChange, className }) {
  const otherOption = OTHER_TEXT_LANGUAGES.find((option) => option.id === imageLanguage);

  return (
    <div className={cn(GROUP_CLASS, className)} role="group" aria-label="圖中文字">
      {PRIMARY_TEXT_LANGUAGES.map((id) => {
        const option = LANGUAGE_OPTIONS.find((item) => item.id === id);
        return (
          <button
            type="button"
            key={id}
            onClick={() => onImageLanguageChange(id)}
            aria-pressed={imageLanguage === id}
            className={cn(SEGMENT_CLASS, "flex-1", imageLanguage === id ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS)}
          >
            {option.shortLabel}
          </button>
        );
      })}
      <Select value={otherOption ? otherOption.id : ""} onValueChange={onImageLanguageChange}>
        <SelectTrigger
          aria-label="其他圖中文字語言"
          className={cn(
            SEGMENT_CLASS,
            "h-auto w-auto flex-1 justify-center gap-1 border-0 bg-transparent ring-offset-0 focus:ring-2 focus:ring-offset-0",
            otherOption ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS
          )}
        >
          <SelectValue placeholder="其他">{otherOption?.shortLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {OTHER_TEXT_LANGUAGES.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.shortLabel}（{option.label}）
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      {children}
    </div>
  );
}

/**
 * Aspect ratio, catalog quality and in-image text controls. `row` packs them into
 * the desktop generate bar; `stack` gives each its own labelled full-width row
 * for the phone settings sheet.
 */
export default function OutputSettings({
  layout = "row",
  aspectRatio,
  onAspectRatioChange,
  aspectRatioLocked = false,
  quality,
  supportedQualities,
  onImageQualityChange,
  imageLanguage,
  onImageLanguageChange,
}) {
  const stacked = layout === "stack";

  const ratioGroup = (
    <div
      className={cn(GROUP_CLASS, "flex-1")}
      role="group"
      aria-label={aspectRatioLocked ? "圖片比例（沿用原圖）" : "圖片比例"}
    >
      {ASPECT_RATIOS.map((ratio) => {
        const active = !aspectRatioLocked && aspectRatio === ratio.id;
        return (
          <button
            type="button"
            key={ratio.id}
            onClick={() => onAspectRatioChange(ratio.id)}
            disabled={aspectRatioLocked}
            aria-label={`設定圖片比例為 ${ratio.label}`}
            aria-pressed={active}
            className={cn(
              SEGMENT_CLASS,
              "flex flex-1 items-center justify-center gap-1 px-1 disabled:cursor-not-allowed disabled:opacity-50",
              stacked && "flex-col gap-0.5 py-2",
              active ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS
            )}
            title={ratio.label}
          >
            <ratio.icon className="icon-sm" aria-hidden="true" />
            <span className={stacked ? "text-[11px]" : "hidden lg:inline"}>{stacked ? ratio.label : ratio.id}</span>
          </button>
        );
      })}
    </div>
  );

  const qualityGroup = (
    <div className={cn(GROUP_CLASS, "flex-wrap")} role="group" aria-label="圖片品質">
      {supportedQualities.map((option) => (
        <button
          type="button"
          key={option}
          onClick={() => onImageQualityChange(option)}
          aria-label={`設定圖片品質為${IMAGE_QUALITY_LABELS[option] || option}`}
          aria-pressed={quality === option}
          className={cn(SEGMENT_CLASS, "min-w-11", stacked && "flex-1", quality === option ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS)}
        >
          {IMAGE_QUALITY_LABELS[option] || option}
        </button>
      ))}
    </div>
  );

  const textGroup = onImageLanguageChange && (
    <TextModeControl imageLanguage={imageLanguage} onImageLanguageChange={onImageLanguageChange} />
  );

  if (stacked) {
    return (
      <div className="space-y-4">
        <Field label={aspectRatioLocked ? "比例（沿用原圖）" : "比例"}>{ratioGroup}</Field>
        <Field label="品質">{qualityGroup}</Field>
        {textGroup && <Field label="圖中文字">{textGroup}</Field>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {ratioGroup}
      <Separator orientation="vertical" className="h-6" />
      {qualityGroup}
      {textGroup && (
        <>
          <Separator orientation="vertical" className="h-6" />
          {textGroup}
        </>
      )}
    </div>
  );
}
