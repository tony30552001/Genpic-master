import React, { useEffect, useRef } from "react";
import { X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StyleImageLightbox({ src, alt, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousActiveElement = document.activeElement;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [onClose]);

  if (!src) return null;

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
          <Button
            ref={closeButtonRef}
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="關閉圖片預覽"
            className="shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/10 p-3 sm:p-6">
          <img
            src={src}
            alt={alt}
            width={1600}
            height={900}
            className="max-h-[calc(92dvh-5rem)] max-w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
