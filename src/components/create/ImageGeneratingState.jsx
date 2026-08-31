import { cn } from "@/lib/utils";
import GenerationSignature from "@/components/icons/GenerationSignature";

const PREVIEW_FRAME_CLASSES = {
  "16:9": "aspect-video w-[88%]",
  "4:3": "aspect-[4/3] w-[82%]",
  "1:1": "aspect-square w-[72%]",
  "9:16": "aspect-[9/16] h-[76%] max-h-[460px]",
};

export default function ImageGeneratingState({
  aspectRatio = "16:9",
  generationStatus,
  compact = false,
  className,
}) {
  const frameClass = compact
    ? "relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-muted/60 shadow-lg ring-1 ring-border/50 dark:border-white/10 dark:bg-neutral-900 dark:ring-transparent"
    : cn(
        "relative flex max-w-[92%] max-h-[82%] items-center justify-center overflow-hidden rounded-2xl border border-primary/15 bg-muted/60 shadow-lg ring-1 ring-border/50 dark:border-white/10 dark:bg-neutral-900 dark:ring-transparent",
        PREVIEW_FRAME_CLASSES[aspectRatio] || PREVIEW_FRAME_CLASSES["16:9"]
      );

  return (
    <div
      className={cn(
        compact
          ? "absolute inset-0 flex flex-col items-center justify-center gap-3 p-3"
          : "w-full flex flex-col items-center justify-center gap-3 px-6 py-12 lg:absolute lg:inset-0 lg:py-0",
        className
      )}
      aria-busy="true"
    >
      <div className={frameClass} aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.16),transparent_62%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.09),transparent_62%)]" />
        <div className="relative flex flex-col items-center gap-3 text-primary">
          <GenerationSignature
            state="working"
            className={compact ? "h-16 w-16" : "h-24 w-24"}
          />
          {!compact && (
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/65">
              Compose
            </span>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-[18%] bottom-[16%] h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
      </div>
      <p className="sr-only" aria-live="polite">
        {generationStatus?.label || "正在生成圖片"}
      </p>
    </div>
  );
}
