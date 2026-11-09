import React, { useRef, useState } from "react";
import { X } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Image } from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pastedImageFile } from "@/lib/imageFile";

/**
 * 單張圖片的上傳格：點擊、拖放、貼上（先聚焦此格）、用目前結果、預覽與移除。
 * 內容圖與風格參考圖共用，只差標題與說明。
 */
export default function ImageSlot({
  title,
  hint,
  fileLabel,
  removeLabel,
  preview = null,
  isUploading = false,
  canUseCurrent = false,
  onFile,
  onClear,
  onUseCurrent,
}) {
  const fileInputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = (file) => {
    if (file?.type.startsWith("image/") && !isUploading) onFile(file);
  };

  return (
    <div
      className="space-y-2"
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        acceptFile(event.dataTransfer?.files?.[0]);
      }}
      onPaste={(event) => {
        const file = pastedImageFile(event);
        if (!file) return;
        event.preventDefault();
        acceptFile(file);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label={fileLabel}
        onChange={(event) => {
          acceptFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {preview ? (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border bg-card p-2 animate-in fade-in zoom-in-95 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none",
            isDragging ? "border-primary bg-primary/10" : "border-border"
          )}
        >
          <img
            src={preview.url}
            alt={preview.alt}
            width={80}
            height={56}
            className="h-14 w-20 shrink-0 rounded-lg bg-muted object-cover"
          />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate font-semibold text-foreground">{preview.title}</p>
            {preview.subtitle && <p className="truncate text-muted-foreground">{preview.subtitle}</p>}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="mt-0.5 rounded text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {isUploading ? "上傳中…" : "更換"}
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={onClear}
            aria-label={removeLabel}
          >
            <X className="icon-sm" aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className={cn(
              "group flex min-h-[72px] w-full items-center gap-3 rounded-xl border-2 border-dashed bg-background px-3 py-3 text-left transition-colors duration-(--motion-hover) press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isDragging
                ? "border-primary bg-primary/10"
                : "border-border hover:border-primary/50 hover:bg-primary/5"
            )}
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors duration-(--motion-hover)",
                isUploading ? "bg-muted" : "bg-primary/10 text-primary group-hover:bg-primary/15"
              )}
            >
              {isUploading ? (
                <Loader2 className="icon-md animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Image className="icon-md" aria-hidden="true" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{title}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={onUseCurrent}
            disabled={isUploading || !canUseCurrent}
          >
            用目前結果
          </Button>
        </>
      )}
    </div>
  );
}
