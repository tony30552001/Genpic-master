import React, { useState } from "react";
import { Image as ImageIcon, Save, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import ShareToLineButton from "../share/ShareToLineButton";

const PREVIEW_FRAME_CLASSES = {
  "16:9": "aspect-video w-[88%]",
  "4:3": "aspect-[4/3] w-[82%]",
  "1:1": "aspect-square w-[72%]",
  "9:16": "aspect-[9/16] h-[76%] max-h-[460px]",
};

const EMPTY_FRAME_CLASSES = {
  "16:9": "aspect-video w-44",
  "4:3": "aspect-[4/3] w-40",
  "1:1": "aspect-square w-36",
  "9:16": "aspect-[9/16] h-44",
};

const getPreviewFrameClass = (aspectRatio) =>
  PREVIEW_FRAME_CLASSES[aspectRatio] || PREVIEW_FRAME_CLASSES["16:9"];

const getEmptyFrameClass = (aspectRatio) =>
  EMPTY_FRAME_CLASSES[aspectRatio] || EMPTY_FRAME_CLASSES["16:9"];

const LOADING_DOT_COLUMNS = 15;
const LOADING_DOT_ROWS = 15;
const LOADING_DOTS = Array.from(
  { length: LOADING_DOT_COLUMNS * LOADING_DOT_ROWS },
  (_, index) => {
    const row = Math.floor(index / LOADING_DOT_COLUMNS);
    const column = index % LOADING_DOT_COLUMNS;
    const center = (LOADING_DOT_COLUMNS - 1) / 2;
    const x = (column - center) / center;
    const y = (row - center) / center;
    const density = Math.max(0, 1 - Math.sqrt(x * x * 0.8 + y * y * 0.95));

    return {
      id: `${row}-${column}`,
      style: {
        "--dot-size": `${(2 + density * 4).toFixed(1)}px`,
        "--dot-opacity": (0.2 + density * 0.52).toFixed(2),
        animationDelay: `${-((row * 0.09 + column * 0.06) % 1.8).toFixed(2)}s`,
      },
    };
  }
);

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
    <div
      className="w-full flex flex-col items-center justify-center gap-3 py-12 px-6 lg:absolute lg:inset-0 lg:py-0"
      aria-busy="true"
    >
      <div
        className={cn(
          "relative flex max-w-[92%] max-h-[82%] items-center justify-center overflow-hidden rounded-[2rem] border border-primary/15 bg-muted/60 shadow-lg ring-1 ring-border/50 dark:border-white/10 dark:bg-neutral-900 dark:ring-transparent",
          getPreviewFrameClass(aspectRatio)
        )}
        aria-hidden="true"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.12),transparent_66%)] dark:bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_66%)]" />
        <div
          className="relative grid h-[76%] w-[76%] place-items-center gap-2"
          style={{ gridTemplateColumns: `repeat(${LOADING_DOT_COLUMNS}, minmax(0, 1fr))` }}
        >
          {LOADING_DOTS.map((dot) => (
            <span
              key={dot.id}
              className="image-preview-dot animate-preview-dot motion-reduce:animate-none"
              style={dot.style}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-primary/[0.05] to-transparent dark:from-white/[0.04]" />
      </div>
      <p className="sr-only" aria-live="polite">
        {generationStatus?.label || "正在生成圖片"}
      </p>
    </div>
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
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 shadow-sm">
            <Wand2 className="h-6 w-6 text-primary/65" aria-hidden="true" />
          </div>
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
              <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
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
            <Save className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">下載圖片</span>
          </button>
        </div>
      )}
    </div>
  );
}
