import React, { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ImageLightbox({
  src,
  alt,
  onClose,
  details,
  downloadUrl,
  downloadName,
  onPrev,
  onNext,
  position,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" && onPrev) {
        event.preventDefault();
        onPrev();
        return;
      }
      if (event.key === "ArrowRight" && onNext) {
        event.preventDefault();
        onNext();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onNext, onPrev]);

  if (!src) return null;

  const detailItems = (details || []).filter((detail) => detail?.value);
  const hasNavigation = Boolean(onPrev || onNext);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overscroll-contain bg-black/70 p-3 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`放大查看${alt}`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="關閉圖片預覽"
      />

      <div
        className="relative z-10 flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-card shadow-2xl animate-in zoom-in-95 duration-200 motion-reduce:animate-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <ZoomIn className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <p className="truncate text-sm font-medium text-foreground">{alt}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {position?.total > 1 && (
              <span className="mr-1 hidden text-xs tabular-nums text-muted-foreground sm:inline">
                第 {position.index + 1} / {position.total} 張
              </span>
            )}
            {hasNavigation && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onPrev}
                  disabled={!onPrev}
                  aria-label="上一張圖片"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onNext}
                  disabled={!onNext}
                  aria-label="下一張圖片"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </>
            )}
            {downloadUrl && (
              <Button asChild variant="ghost" size="icon">
                <a
                  href={downloadUrl}
                  download={downloadName}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="下載原圖"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                </a>
              </Button>
            )}
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="關閉圖片預覽"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          <div className="flex min-h-0 flex-1 items-center justify-center bg-black/10 p-3 sm:p-6">
            <img
              src={src}
              alt={alt}
              width={1600}
              height={900}
              className="max-h-[calc(92dvh-5rem)] max-w-full object-contain"
            />
          </div>

          {detailItems.length > 0 && (
            <dl className="w-full shrink-0 space-y-3 border-t border-border bg-card/60 p-4 text-sm lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0 sm:p-5">
              {detailItems.map((detail) => (
                <div key={detail.label} className="min-w-0 space-y-1">
                  <dt className="text-xs font-medium text-muted-foreground">{detail.label}</dt>
                  <dd className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
