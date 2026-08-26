import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * PowerPoint 式的縮圖列：每一頁設計完成就出現在這裡，還沒產出的頁先以骨架佔位。
 *
 * 以格狀排列而非單欄，讓右側舞台在筆電寬度也能一次看到六頁以上，
 * 減少長簡報時的捲動距離。
 *
 * 縮圖是伺服器保存的授稿 SVG——也就是最終 PPTX 的同一份來源，
 * 用 `<img>` 渲染（瀏覽器的沙盒模式），所以模型產生的內容不會進到頁面的 DOM。
 */
export default function DeckSlideRail({
  total = 0,
  slides = [],
  previews = {},
  activeSlideNumber = null,
  selectedSlideNumber = null,
  onSelect,
}) {
  const titleBySlide = new Map(slides.map((slide) => [slide.slideNumber, slide.title]));
  const pageCount = Math.max(total, slides.length);
  if (pageCount === 0) return null;

  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="min-w-0 truncate text-sm font-medium">投影片預覽</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {slides.length}/{pageCount}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
        <ol className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4">
          {pages.map((slideNumber) => {
            const preview = previews[slideNumber];
            const title = titleBySlide.get(slideNumber) || preview?.title || "";
            const isAuthoring = activeSlideNumber === slideNumber;
            const isSelected = selectedSlideNumber === slideNumber;

            return (
              <li key={slideNumber} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelect?.(isSelected ? null : slideNumber)}
                  disabled={!preview}
                  aria-pressed={isSelected}
                  aria-label={`第 ${slideNumber} 頁${title ? `：${title}` : ""}`}
                  className={cn(
                    "flex w-full min-w-0 flex-col gap-1 rounded-lg border p-1.5 text-left touch-manipulation transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-border hover:bg-muted/60",
                    !preview && "cursor-default"
                  )}
                >
                  <span className="relative block aspect-video w-full overflow-hidden rounded border border-border bg-background">
                    {preview ? (
                      <img
                        src={preview.url}
                        alt={`第 ${slideNumber} 頁預覽`}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <Skeleton className="h-full w-full rounded-none" />
                    )}
                    {isAuthoring && !preview && (
                      <Loader2
                        className="absolute inset-0 m-auto h-4 w-4 animate-spin text-primary"
                        aria-hidden="true"
                      />
                    )}
                    <span className="absolute left-1 top-1 rounded bg-background/85 px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {slideNumber}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-foreground">
                    {title || (isAuthoring ? "設計中…" : "尚未產出")}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
