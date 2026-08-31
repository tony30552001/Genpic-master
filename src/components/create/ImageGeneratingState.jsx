import { cn } from "@/lib/utils";

const PREVIEW_LAYOUT_CLASSES = {
  "16:9": "w-[88%] max-w-[760px]",
  "4:3": "w-[82%] max-w-[640px]",
  "1:1": "w-[72%] max-w-[500px]",
  "9:16": "w-[46%] min-w-36 max-w-[240px]",
};

const PREVIEW_ASPECT_CLASSES = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
  "9:16": "aspect-[9/16]",
};

export default function ImageGeneratingState({
  aspectRatio = "16:9",
  generationStatus,
  promptSummary,
  resolutionLabel,
  compact = false,
  className,
}) {
  const statusLabel = generationStatus?.label || "正在生成圖片";
  const helperText =
    generationStatus?.helperText || "完成後會自動顯示在這裡";
  const normalizedPrompt =
    typeof promptSummary === "string"
      ? promptSummary.trim().replace(/\s+/g, " ").slice(0, 180)
      : "";
  const summaryText = normalizedPrompt
    ? `“${normalizedPrompt}${promptSummary.trim().length > 180 ? "…" : ""}”`
    : helperText;
  const aspectClass =
    PREVIEW_ASPECT_CLASSES[aspectRatio] || PREVIEW_ASPECT_CLASSES["16:9"];

  const canvas = (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-xl border border-border/70 bg-muted/50 shadow-inner ring-1 ring-border/20",
        compact ? "h-full" : aspectClass
      )}
      data-image-generation-placeholder
    >
      <div
        className="image-generation-dots pointer-events-none absolute inset-0"
        data-generation-dots
        aria-hidden="true"
      />
      <div
        className="image-generation-glow pointer-events-none absolute -inset-[18%]"
        data-generation-glow
        aria-hidden="true"
      />
      <div
        className="image-generation-glow image-generation-glow-secondary pointer-events-none absolute -inset-[18%]"
        data-generation-glow
        aria-hidden="true"
      />

      {resolutionLabel && (
        <span
          className="absolute right-2 top-2 rounded-full border border-border/60 bg-background/75 px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground shadow-sm backdrop-blur-sm"
          aria-hidden="true"
        >
          {resolutionLabel}
        </span>
      )}

      {compact && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 via-background/65 to-transparent px-3 pb-2.5 pt-8">
          <div className="flex items-center gap-2">
            <span
              className="image-generation-status-dot h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70"
              aria-hidden="true"
            />
            <span className="truncate text-[11px] font-medium text-foreground">
              {statusLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        compact
          ? "absolute inset-0 p-2"
          : "flex w-full flex-col items-center justify-center px-6 py-10 lg:absolute lg:inset-0 lg:py-0",
        className
      )}
      aria-busy="true"
      aria-live="polite"
      aria-atomic="true"
      role="status"
    >
      {compact ? (
        canvas
      ) : (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-3",
            PREVIEW_LAYOUT_CLASSES[aspectRatio] || PREVIEW_LAYOUT_CLASSES["16:9"]
          )}
        >
          {canvas}
          <div className="min-w-0 px-0.5 text-left">
            <div className="flex items-center gap-2">
              <span
                className="image-generation-status-dot h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70"
                aria-hidden="true"
              />
              <p className="truncate text-sm font-semibold text-foreground">
                {statusLabel}
              </p>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {summaryText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
