import React, { useEffect, useId, useState } from "react";
import { Image } from "@/components/icons/lucideContent";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  PRIMARY_ATTACHMENT_PURPOSES,
  STYLE_TRANSFER_PURPOSE,
} from "@/lib/attachmentPurposes";
import ImageSlot from "./ImageSlot";

const MERGE_NOTICE_KEY = "genpic_transform_merge_notice_seen";

const readMergeNoticeSeen = () => {
  try {
    return localStorage.getItem(MERGE_NOTICE_KEY) === "1";
  } catch {
    return true;
  }
};

function SlotHeader({ index, title, description }) {
  return (
    <div className="space-y-0.5">
      <h3 className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground"
          aria-hidden="true"
        >
          {index}
        </span>
        {title}
      </h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * 快速創作的圖片輸入：內容圖（附圖）與風格參考圖並列，共用同一個上傳格。
 * 內容圖決定生成或轉換的用途；風格參考圖只用來分析畫風，不當內容參考。
 */
export default function ImageInputs({
  attachment,
  isUploadingAttachment,
  purposeId,
  onPurposeChange,
  onAttachFile,
  onAttachCurrentResult,
  onClearAttachment,
  styleReferencePreview,
  isUploadingStyleReference,
  onStyleReferenceUpload,
  onStyleReferenceCurrentResult,
  onClearStyleReference,
  styleAnalysis,
  canUseCurrentResult,
}) {
  const purposeLabelId = useId();
  const [showMergeNotice] = useState(() => !readMergeNoticeSeen());

  useEffect(() => {
    if (!attachment || !showMergeNotice) return;
    try {
      localStorage.setItem(MERGE_NOTICE_KEY, "1");
    } catch {
      // The notice is shown again next time when storage is unavailable.
    }
  }, [attachment, showMergeNotice]);

  return (
    <Card className="rounded-none border-0 bg-transparent shadow-none lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-sm">
      <CardContent className="space-y-4 px-0 py-4 lg:p-4">
        <div className="space-y-0.5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Image className="icon-sm text-primary" aria-hidden="true" />
            圖片
            <span className="text-xs font-normal text-muted-foreground">選填</span>
          </h2>
          <p className="hidden text-xs text-muted-foreground lg:block">
            內容圖可參考、修改、換背景或取出元素；風格圖只學畫風。兩者可同時使用，都能拖放或貼上。
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <SlotHeader index={1} title="內容圖" description="要參考、修改、換背景的圖" />
            <ImageSlot
              title="上傳內容圖"
              hint="點擊、拖放或貼上"
              fileLabel="選擇內容圖檔案"
              removeLabel="移除內容圖"
              isUploading={isUploadingAttachment}
              canUseCurrent={canUseCurrentResult}
              preview={
                attachment && {
                  url: attachment.previewUrl,
                  alt: "內容圖預覽",
                  title: attachment.origin === "result" ? "目前結果" : attachment.name,
                  subtitle: `原圖比例約 ${attachment.aspectRatio}`,
                }
              }
              onFile={onAttachFile}
              onClear={onClearAttachment}
              onUseCurrent={onAttachCurrentResult}
            />
          </div>

          <div className="space-y-2">
            <SlotHeader index={2} title="風格圖" description="只學畫風，不會當成內容；可分析並收藏" />
            <ImageSlot
              title="上傳風格圖"
              hint="點擊、拖放或貼上"
              fileLabel="選擇風格圖檔案"
              removeLabel="移除風格圖與分析結果"
              isUploading={isUploadingStyleReference}
              canUseCurrent={canUseCurrentResult}
              preview={
                styleReferencePreview && {
                  url: styleReferencePreview,
                  alt: "風格圖預覽",
                  title: "風格圖",
                }
              }
              onFile={onStyleReferenceUpload}
              onClear={onClearStyleReference}
              onUseCurrent={onStyleReferenceCurrentResult}
            />
          </div>
        </div>

        {styleReferencePreview && styleAnalysis}

        {attachment && (
          <div className="space-y-2 animate-in fade-in duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
            {showMergeNotice && (
              <p className="rounded-md bg-primary/5 px-2 py-1.5 text-xs text-primary">
                圖片轉換已整合到這裡：選擇內容圖的用途即可。
              </p>
            )}

            <p id={purposeLabelId} className="text-xs text-muted-foreground">內容圖要怎麼用</p>
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
              <p className="text-xs text-primary">目前用途：套用風格到內容圖（在「進階：風格」中設定）</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
