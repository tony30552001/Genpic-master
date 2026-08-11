import { cn } from "@/lib/utils";

const PREVIEW_FRAME_CLASSES = {
  "16:9": "aspect-video w-[88%]",
  "4:3": "aspect-[4/3] w-[82%]",
  "1:1": "aspect-square w-[72%]",
  "9:16": "aspect-[9/16] h-[76%] max-h-[460px]",
};

const LOADING_DOT_COLUMNS = 15;
const LOADING_DOT_ROWS = 15;
const LOADING_DOTS = Array.from(
  { length: LOADING_DOT_COLUMNS * LOADING_DOT_ROWS },
  (_, index) => {
    const row = Math.floor(index / LOADING_DOT_COLUMNS);
    const column = index % LOADING_DOT_COLUMNS;
    const center = (LOADING_DOT_COLUMNS - 1) / 2;
    const x = (column - center) / center;
    const y = (row - center) / center;
    const density = Math.max(0, 1 - Math.sqrt(x * x * 0.8 + y * y * 0.95));

    return {
      id: `${row}-${column}`,
      style: {
        "--dot-size": `${(2 + density * 4).toFixed(1)}px`,
        "--dot-opacity": (0.2 + density * 0.52).toFixed(2),
        animationDelay: `${-((row * 0.09 + column * 0.06) % 1.8).toFixed(2)}s`,
      },
    };
  }
);

export default function ImageGeneratingState({
  aspectRatio = "16:9",
  generationStatus,
  compact = false,
  className,
}) {
  const frameClass = compact
    ? "relative flex h-full w-full items-center justify-center overflow-hidden rounded-[2rem] border border-primary/15 bg-muted/60 shadow-lg ring-1 ring-border/50 dark:border-white/10 dark:bg-neutral-900 dark:ring-transparent"
    : cn(
        "relative flex max-w-[92%] max-h-[82%] items-center justify-center overflow-hidden rounded-[2rem] border border-primary/15 bg-muted/60 shadow-lg ring-1 ring-border/50 dark:border-white/10 dark:bg-neutral-900 dark:ring-transparent",
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
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.12),transparent_66%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_66%)]" />
        <div
          className="relative grid h-[76%] w-[76%] place-items-center gap-2"
          style={{ gridTemplateColumns: `repeat(${LOADING_DOT_COLUMNS}, minmax(0, 1fr))` }}
        >
          {LOADING_DOTS.map((dot) => (
            <span
              key={dot.id}
              className="image-preview-dot animate-preview-dot motion-reduce:animate-none"
              style={dot.style}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-primary/[0.05] to-transparent dark:from-white/[0.04]" />
      </div>
      <p className="sr-only" aria-live="polite">
        {generationStatus?.label || "正在生成圖片"}
      </p>
    </div>
  );
}
