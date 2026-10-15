import React, { useEffect, useId, useRef, useState } from "react";
import { X, Upload } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Image } from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PRIMARY_ATTACHMENT_PURPOSES,
  STYLE_TRANSFER_PURPOSE,
} from "@/lib/attachmentPurposes";

const MERGE_NOTICE_KEY = "genpic_transform_merge_notice_seen";

const readMergeNoticeSeen = () => {
  try {
    return localStorage.getItem(MERGE_NOTICE_KEY) === "1";
  } catch {
    return true;
  }
};

/**
 * 附圖（選填）與「這張圖要怎麼用」。
 * 用途決定送出時呼叫生成或轉換；套用風格到附圖由進階風格區切換。
 */
export default function AttachmentPicker({
  attachment,
  isUploading,
  purposeId,
  onPurposeChange,
  onAttachFile,
  onAttachCurrentResult,
  canAttachCurrentResult,
  onClear,
}) {
  const fileInputRef = useRef(null);
  const purposeLabelId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [showMergeNotice] = useState(() => !readMergeNoticeSeen());

  useEffect(() => {
    if (!attachment || !showMergeNotice) return;
    try {
      localStorage.setItem(MERGE_NOTICE_KEY, "1");
    } catch {
      // The notice is shown again next time when storage is unavailable.
    }
  }, [attachment, showMergeNotice]);

  const handleFiles = (files) => {
    const file = files?.[0];
    if (file && file.type.startsWith("image/")) onAttachFile(file);
  };

  return (
    <Card
      className={cn(
        "rounded-2xl border-border bg-card transition-colors duration-(--motion-hover)",
        isDragging && "border-primary bg-primary/5"
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer?.files);
      }}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Image className="icon-sm text-primary" aria-hidden="true" />
              附圖
              <span className="text-xs font-normal text-muted-foreground">選填</span>
            </h2>
            {!attachment && (
              <p className="text-xs text-muted-foreground">
                上傳圖片或用目前結果，就能參考內容、修改、換背景或取出元素。
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="選擇附圖檔案"
              onChange={(event) => {
                handleFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Upload className="icon-sm" aria-hidden="true" />
              )}
              {attachment ? "更換圖片" : "上傳圖片"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={onAttachCurrentResult}
              disabled={isUploading || !canAttachCurrentResult}
            >
              用目前結果
            </Button>
          </div>
        </div>

        {attachment && (
          <div className="space-y-2 animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
            <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-2">
              <img
                src={attachment.previewUrl}
                alt="附圖預覽"
                width={80}
                height={56}
                className="h-14 w-20 shrink-0 rounded object-cover"
              />
              <div className="min-w-0 flex-1 text-xs">
                <p className="truncate font-semibold text-foreground">
                  {attachment.origin === "result" ? "目前結果" : attachment.name}
                </p>
                <p className="truncate text-muted-foreground">原圖比例約 {attachment.aspectRatio}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={onClear}
                aria-label="移除附圖"
              >
                <X className="icon-sm" aria-hidden="true" />
              </Button>
            </div>

            {showMergeNotice && (
              <p className="rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
                圖片轉換已整合到這裡：選擇這張圖的用途即可。
              </p>
            )}

            <p id={purposeLabelId} className="text-xs text-muted-foreground">這張圖要怎麼用</p>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={purposeLabelId}>
              {PRIMARY_ATTACHMENT_PURPOSES.map((option) => {
                const isSelected = purposeId === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => onPurposeChange(option.id)}
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs transition-colors duration-(--motion-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97]",
                      isSelected
                        ? "border-primary bg-primary/10 font-semibold text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            {purposeId === STYLE_TRANSFER_PURPOSE && (
              <p className="text-xs text-primary">目前用途：套用風格到附圖（在「進階：風格」中設定）</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
