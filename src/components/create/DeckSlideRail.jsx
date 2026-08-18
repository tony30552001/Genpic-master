import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * PowerPoint 式的垂直縮圖列：每一頁設計完成就出現在這裡，還沒產出的頁先以骨架佔位。
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
    <div className="rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <h3 className="min-w-0 truncate text-sm font-medium">投影片預覽</h3>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {slides.length}/{pageCount}
        </span>
      </div>

      <div className="max-h-[28rem] overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
        <ol className="space-y-2 p-3">
          {pages.map((slideNumber) => {
            const preview = previews[slideNumber];
            const title = titleBySlide.get(slideNumber) || preview?.title || "";
            const isAuthoring = activeSlideNumber === slideNumber;
            const isSelected = selectedSlideNumber === slideNumber;

            return (
              <li key={slideNumber}>
                <button
                  type="button"
                  onClick={() => onSelect?.(isSelected ? null : slideNumber)}
                  disabled={!preview}
                  aria-pressed={isSelected}
                  aria-label={`第 ${slideNumber} 頁${title ? `：${title}` : ""}`}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md border p-1.5 text-left transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent hover:border-border hover:bg-background",
                    !preview && "cursor-default"
                  )}
                >
                  <span className="relative aspect-video w-24 shrink-0 overflow-hidden rounded border border-border bg-background">
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
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium tabular-nums text-muted-foreground">
                      第 {slideNumber} 頁
                    </span>
                    <span className="block truncate text-xs text-foreground">
                      {title || (isAuthoring ? "設計中…" : "尚未產出")}
                    </span>
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
