import React, { useState } from "react";
import { Image as ImageIcon, Save, Wand2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ShareToLineButton from "../share/ShareToLineButton";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  onDownload,
  user,
}) {
  const [imageError, setImageError] = useState(false);

  // 狀態 1：生成中畫面
  const renderGeneratingState = () => (
    <div className="w-full flex items-center justify-center py-12 lg:py-0 lg:absolute lg:inset-4">
      <Skeleton className="w-[85%] aspect-video max-h-[85%] rounded-xl opacity-60 relative overflow-hidden flex flex-col items-center justify-center gap-4">
        <div className="relative z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm bg-white/40 p-6 rounded-2xl border border-white/50 shadow-sm" aria-live="polite">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
            <Wand2 className="w-5 h-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
          </div>
          <div className="flex flex-col items-center text-center">
            <p className="text-sm font-semibold tracking-wide text-foreground/80 mb-0.5 animate-pulse">正在為您繪製構想...</p>
            <p className="text-[11px] text-foreground/50">大約需要 5-10 秒鐘</p>
          </div>
        </div>
      </Skeleton>
    </div>
  );

  // 狀態 2：空白初始畫面
  const renderEmptyState = () => (
    <div className="flex flex-col items-center gap-4 text-center py-12 px-6">
      <div className="w-20 h-20 bg-primary/10 rounded-2xl flex items-center justify-center">
        <Wand2 className="w-9 h-9 text-primary/60" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">描述你的想法，AI 為你繪製</p>
        <p className="text-xs text-muted-foreground">在左側輸入內容描述，選擇風格後按「生成」</p>
      </div>
    </div>
  );

  // 狀態 3：圖片展示畫面
  const renderImageState = () => {
    if (imageError) {
      return (
        <div className="flex flex-col items-center gap-3 text-destructive py-12">
          <ImageIcon className="w-12 h-12 opacity-50" />
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
              onClick={onDownload}
              aria-label="下載產生的圖片"
              className="flex items-center h-9 gap-1.5 text-xs font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-3 py-2 rounded-lg transition-colors shadow-lg border border-border/50"
            >
              <Save className="w-4 h-4 shrink-0" />
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
    if (generatedImage) return renderImageState();
    if (isGenerating) return renderGeneratingState();
    return renderEmptyState();
  };

  return (
    <div className="relative flex flex-col items-center justify-center w-full h-auto lg:h-full lg:min-h-[500px] bg-muted/30 rounded-xl overflow-hidden group border border-border/40">

      {renderContent()}

      {/* 桌面版操作按鈕層（absolute 懸浮） */}
      {generatedImage && !imageError && (
        <div className="hidden lg:flex absolute bottom-4 right-4 z-20 flex-wrap justify-end items-center gap-2 drop-shadow-md">
          <ShareToLineButton
            imageUrl={generatedImage}
            user={user}
            className="[&>button]:h-10 [&>button]:px-4 [&>button]:text-sm [&>button]:rounded-lg [&>button]:shadow-lg"
          />
          <button
            onClick={onDownload}
            aria-label="下載產生的圖片"
            className="flex items-center h-10 gap-1.5 text-sm font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-4 py-2 rounded-lg transition-colors shadow-lg border border-border/50"
          >
            <Save className="w-4 h-4 shrink-0" />
            <span className="whitespace-nowrap">下載圖片</span>
          </button>
        </div>
      )}
    </div>
  );
}
