import React from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { IMAGE_QUALITY_LABELS } from "@/config";
import { LANGUAGE_OPTIONS, NO_TEXT_LANGUAGE } from "@/lib/imageTextLanguage";
import { VARIANT_COUNTS } from "@/lib/imageVariants";
import { Copy } from "@/components/icons/lucideControls";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 簡報" },
  { id: "4:3", label: "4:3 傳統" },
  { id: "1:1", label: "1:1 社群" },
  { id: "9:16", label: "9:16 手機" },
];

/** A frame drawn in the ratio itself, fitted into a 16px box. */
function RatioShape({ ratio }) {
  const [w, h] = ratio.split(":").map(Number);
  const scale = 16 / Math.max(w, h);
  return (
    <span className="grid size-4 shrink-0 place-items-center" aria-hidden="true">
      <span
        className="block rounded-[2px] border-[1.5px] border-current"
        style={{ width: `${w * scale}px`, height: `${h * scale}px` }}
      />
    </span>
  );
}

const PRIMARY_TEXT_LANGUAGES = ["zh-TW", NO_TEXT_LANGUAGE];
const OTHER_TEXT_LANGUAGES = LANGUAGE_OPTIONS.filter((option) => !PRIMARY_TEXT_LANGUAGES.includes(option.id));

const GROUP_CLASS = "flex gap-1 rounded-lg border border-border/70 bg-muted/70 p-1 shadow-inner";
const SEGMENT_CLASS =
  "min-h-11 touch-manipulation whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted";
const SEGMENT_ACTIVE_CLASS = "bg-background text-primary font-semibold shadow-sm ring-1 ring-border/60";
const SEGMENT_IDLE_CLASS = "text-muted-foreground hover:bg-background/70 hover:text-foreground";

function TextModeControl({ imageLanguage, onImageLanguageChange, compact = false, className }) {
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
            className={cn(SEGMENT_CLASS, "flex-1", compact && "min-h-9", imageLanguage === id ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS)}
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
            compact && "min-h-9",
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

function VariantCountControl({ count, onCountChange, className }) {
  return (
    <Select value={String(count)} onValueChange={(value) => onCountChange(Number(value))}>
      <SelectTrigger
        aria-label="一次生成張數"
        title="一次生成幾張變體"
        className={cn("h-11 min-h-11 w-auto justify-start gap-2 rounded-lg bg-muted/70 px-3 text-xs font-semibold shadow-inner", className)}
      >
        <Copy className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="tabular-nums">×{count}</span>
      </SelectTrigger>
      <SelectContent>
        {VARIANT_COUNTS.map((option) => (
          <SelectItem key={option} value={String(option)} className="tabular-nums">
            ×{option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
 * the desktop generate bar with pointer-sized (36px) segments; `stack` gives each its own labelled full-width row
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
  variantCount,
  onVariantCountChange,
}) {
  const stacked = layout === "stack";

  const ratioGroup = (
    <div
      className={cn(GROUP_CLASS, stacked && "flex-1")}
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
              "flex flex-1 items-center justify-center gap-1 disabled:cursor-not-allowed disabled:opacity-50",
              stacked ? "flex-col gap-0.5 px-1 py-2" : "min-h-9 px-2.5",
              active ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS
            )}
            title={ratio.label}
          >
            <RatioShape ratio={ratio.id} />
            <span className={stacked ? "text-[11px]" : "tabular-nums"}>{stacked ? ratio.label : ratio.id}</span>
          </button>
        );
      })}
    </div>
  );

  const qualityGroup = (
    <div className={cn(GROUP_CLASS, "flex-wrap")} role="group" aria-label="圖片品質" title="較高品質可能增加生成時間與費用">
      {supportedQualities.map((option) => (
        <button
          type="button"
          key={option}
          onClick={() => onImageQualityChange(option)}
          aria-label={`設定圖片品質為${IMAGE_QUALITY_LABELS[option] || option}`}
          aria-pressed={quality === option}
          className={cn(SEGMENT_CLASS, "min-w-11", stacked ? "flex-1" : "min-h-9", quality === option ? SEGMENT_ACTIVE_CLASS : SEGMENT_IDLE_CLASS)}
        >
          {IMAGE_QUALITY_LABELS[option] || option}
        </button>
      ))}
    </div>
  );

  const textGroup = onImageLanguageChange && (
    <TextModeControl imageLanguage={imageLanguage} onImageLanguageChange={onImageLanguageChange} compact={!stacked} />
  );

  if (stacked) {
    return (
      <div className="space-y-4">
        <Field label={aspectRatioLocked ? "比例（沿用原圖）" : "比例"}>{ratioGroup}</Field>
        <Field label="品質">{qualityGroup}</Field>
        {textGroup && <Field label="圖中文字">{textGroup}</Field>}
        {onVariantCountChange && (
          <Field label="張數">
            <VariantCountControl count={variantCount} onCountChange={onVariantCountChange} className="w-full" />
          </Field>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {ratioGroup}
      <Separator orientation="vertical" className="h-6" />
      {qualityGroup}
      {textGroup && (
        <>
          <Separator orientation="vertical" className="h-6" />
          {textGroup}
        </>
      )}
      {onVariantCountChange && (
        <>
          <Separator orientation="vertical" className="h-6" />
          <VariantCountControl count={variantCount} onCountChange={onVariantCountChange} />
        </>
      )}
    </div>
  );
}
