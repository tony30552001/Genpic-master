import React, { useState } from "react";
import {
  Save,
} from "@/components/icons/lucideControls";
import {
  Image as ImageIcon,
} from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { cn } from "@/lib/utils";
import ShareToLineButton from "../share/ShareToLineButton";
import ImageGeneratingState from "./ImageGeneratingState";

const EMPTY_FRAME_CLASSES = {
  "16:9": "aspect-video w-44",
  "4:3": "aspect-[4/3] w-40",
  "1:1": "aspect-square w-36",
  "9:16": "aspect-[9/16] h-44",
};

const getEmptyFrameClass = (aspectRatio) =>
  EMPTY_FRAME_CLASSES[aspectRatio] || EMPTY_FRAME_CLASSES["16:9"];

export default function ImagePreview({
  generatedImage,
  isGenerating,
  aspectRatio = "16:9",
  generationStatus,
  onDownload,
  user,
}) {
  const [imageError, setImageError] = useState(false);

  // 狀態 1：生成中畫面
  const renderGeneratingState = () => (
    <ImageGeneratingState
      aspectRatio={aspectRatio}
      generationStatus={generationStatus}
    />
  );

  // 狀態 2：空白初始畫面
  const renderEmptyState = () => (
    <div className="flex w-full flex-col items-center gap-4 px-6 py-10 text-center">
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-dashed border-border bg-background shadow-md ring-1 ring-border/50",
          getEmptyFrameClass(aspectRatio)
        )}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: "linear-gradient(hsl(var(--muted-foreground)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--muted-foreground)) 1px, transparent 1px)",
            backgroundSize: "18px 18px",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <ProductGlyph kind="create" className="h-10 w-10 text-primary/65" aria-hidden="true" />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">預覽區已準備好</p>
        <p className="text-xs text-muted-foreground">
          目前比例為 {aspectRatio}。完成內容與風格設定後，生成結果會出現在這裡。
        </p>
      </div>
    </div>
  );

  // 狀態 3：圖片展示畫面
  const renderImageState = () => {
    if (imageError) {
      return (
        <div className="flex flex-col items-center gap-3 text-destructive py-12">
          <ImageIcon className="icon-display opacity-50" aria-hidden="true" />
          <p className="text-sm font-medium">圖片載入失敗，請嘗試重新下載或重新產生。</p>
        </div>
      );
    }

    return (
      <>
        {/* Mobile: flow layout，限制最大高度，圖片不蓋版 */}
        <div className="w-full flex flex-col items-center gap-3 p-3 lg:hidden">
          <img
            src={generatedImage}
            alt="AI 產生的圖片"
            width={1536}
            height={1024}
            className="max-w-full w-auto max-h-[55vh] object-contain rounded-lg animate-in fade-in zoom-in-95 duration-500 shadow-xl"
            onError={() => setImageError(true)}
            loading="lazy"
            decoding="async"
          />
          {/* Mobile 操作按鈕：跟在圖片正下方，非 absolute */}
          <div className="flex flex-wrap justify-center items-center gap-2 pb-1">
            <ShareToLineButton
              imageUrl={generatedImage}
              user={user}
              className="[&>button]:h-9 [&>button]:px-3 [&>button]:text-xs [&>button]:rounded-lg [&>button]:shadow-lg"
            />
            <button
              type="button"
              onClick={onDownload}
              aria-label="下載產生的圖片"
              className="flex items-center h-10 gap-1.5 text-xs font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-3 py-2 rounded-lg transition-colors shadow-lg border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Save className="icon-sm" aria-hidden="true" />
              <span className="whitespace-nowrap">下載圖片</span>
            </button>
          </div>
        </div>
        {/* Desktop: 保持 absolute 填滿預覽區 */}
        <div className="hidden lg:flex absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar">
          <div className="min-h-full w-full flex items-center justify-center p-4 pb-[88px] relative z-10">
            <img
              src={generatedImage}
              alt="AI 產生的圖片"
              width={1536}
              height={1024}
              className="max-w-[85%] h-auto my-auto object-contain animate-in fade-in zoom-in-95 duration-500 shadow-xl"
              onError={() => setImageError(true)}
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      </>
    );
  };

  const renderContent = () => {
    if (isGenerating) return renderGeneratingState();
    if (generatedImage) return renderImageState();
    return renderEmptyState();
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-auto min-h-[260px] lg:h-full lg:min-h-[500px] overflow-hidden group rounded-xl border border-border bg-background shadow-sm lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">

      {renderContent()}

      {/* 桌面版操作按鈕層（absolute 懸浮） */}
      {generatedImage && !imageError && (
        <div className="hidden lg:flex absolute bottom-4 right-4 z-20 flex-wrap justify-end items-center gap-2 drop-shadow-md">
          <ShareToLineButton
            imageUrl={generatedImage}
            user={user}
            className="[&>button]:h-10 [&>button]:px-4 [&>button]:text-sm [&>button]:rounded-lg [&>button]:shadow-md"
          />
          <button
            type="button"
            onClick={onDownload}
            aria-label="下載產生的圖片"
            className="flex items-center h-10 gap-1.5 text-sm font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-4 py-2 rounded-lg transition-colors shadow-md border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Save className="icon-sm" aria-hidden="true" />
            <span className="whitespace-nowrap">下載圖片</span>
          </button>
        </div>
      )}
    </div>
  );
}
