import { ChevronLeft, ChevronRight, Loader2, Presentation } from "lucide-react";

import { Button } from "@/components/ui/button";
import DeckSlideRail from "./DeckSlideRail";

/**
 * 生成中與完成後的右側舞台：上方是目前檢視的整頁大圖，下方是縮圖列。
 *
 * 沒有手動選頁時舞台會跟著最新完成的一頁走，讓 5–15 分鐘的等待變成可看的過程；
 * 一旦手動選頁就固定在那一頁，直到使用者按「回到最新」。
 */
export default function DeckPreviewStage({
  total,
  slides,
  previews,
  activeSlideNumber,
  stageSlideNumber,
  followingLatest,
  onSelect,
}) {
  const authored = Object.keys(previews)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const stagePreview = stageSlideNumber ? previews[stageSlideNumber] : null;
  const position = authored.indexOf(stageSlideNumber);
  const previousSlide = position > 0 ? authored[position - 1] : null;
  const nextSlide =
    position >= 0 && position < authored.length - 1 ? authored[position + 1] : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex justify-center bg-muted/40">
          <div className="relative flex aspect-video w-full items-center justify-center lg:h-[38vh] lg:w-auto lg:max-w-full">
            {stagePreview ? (
              <img
                src={stagePreview.url}
                alt={`第 ${stageSlideNumber} 頁預覽`}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center">
                {activeSlideNumber ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      正在設計第 {activeSlideNumber} 頁…
                    </p>
                  </>
                ) : (
                  <>
                    <Presentation className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm text-muted-foreground">
                      第一頁完成後就會出現在這裡。
                    </p>
                  </>
                )}
              </div>
            )}

            {authored.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 h-8 w-8 -translate-y-1/2 touch-manipulation opacity-90 shadow-sm"
                  onClick={() => onSelect(previousSlide)}
                  disabled={!previousSlide}
                  aria-label="檢視上一頁"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 h-8 w-8 -translate-y-1/2 touch-manipulation opacity-90 shadow-sm"
                  onClick={() => onSelect(nextSlide)}
                  disabled={!nextSlide}
                  aria-label="檢視下一頁"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2 border-t border-border px-3 py-2">
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {stageSlideNumber ? `第 ${stageSlideNumber} 頁` : "尚未產出"}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {stagePreview?.title || ""}
          </span>
          {followingLatest ? (
            <span className="shrink-0 text-xs text-muted-foreground">跟隨最新</span>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={() => onSelect(null)}
            >
              回到最新
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-0 lg:flex-1">
        <DeckSlideRail
          total={total}
          slides={slides}
          previews={previews}
          activeSlideNumber={activeSlideNumber}
          selectedSlideNumber={stageSlideNumber}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}
