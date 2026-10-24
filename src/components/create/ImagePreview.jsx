import React, { useState } from "react";
import {
  Maximize2,
  Save,
} from "@/components/icons/lucideControls";
import {
  Image as ImageIcon,
} from "@/components/icons/lucideContent";
import { getImageOutputLabel } from "@/lib/imageOutput";
import { cn } from "@/lib/utils";
import ShareToLineButton from "../share/ShareToLineButton";
import ImageGeneratingState from "./ImageGeneratingState";
import RefineForm from "./RefineForm";
import VersionStrip from "./VersionStrip";

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
  promptSummary,
  onDownload,
  user,
  isRefining = false,
  refineError = "",
  onRefine,
  isCompressedPreview = false,
  versionRows = [],
  activeVersionId = null,
  onSelectVersion,
  getVersionLabel,
  getVersion,
  onExpand,
}) {
  const [failedImage, setFailedImage] = useState(null);
  const imageError = Boolean(generatedImage) && failedImage === generatedImage;
  const shownImage = generatedImage && !(isGenerating && !isRefining) ? generatedImage : null;
  // A refine or version switch swaps the image in place: keep the outgoing one underneath and
  // fade the new one in once it has loaded, so only the edited area appears to change.
  const [swap, setSwap] = useState({ image: shownImage, under: null, loaded: false });
  if (swap.image !== shownImage) {
    setSwap({ image: shownImage, under: shownImage && swap.image, loaded: false });
  }
  const crossfading = Boolean(swap.under);

  // 狀態 1：生成中畫面（修改中則保留目前圖片）
  const renderGeneratingState = () => (
    <ImageGeneratingState
      aspectRatio={aspectRatio}
      generationStatus={generationStatus}
      promptSummary={promptSummary}
      resolutionLabel={getImageOutputLabel({ aspectRatio })}
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
          <ImageIcon className="h-10 w-10 text-primary/65" aria-hidden="true" />
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

  // 狀態 3：圖片展示畫面，下方為修改列、版本列與操作
  const renderImageState = () => (
    <div className="flex w-full flex-col gap-3 p-3 lg:p-0">
      {imageError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-destructive">
          <ImageIcon className="icon-display opacity-50" aria-hidden="true" />
          <p className="text-sm font-medium">圖片載入失敗，請嘗試重新下載或重新產生。</p>
        </div>
      ) : (
        <div className="relative mx-auto" aria-busy={isRefining}>
          {crossfading && (
            <img
              src={swap.under}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full rounded-lg object-contain"
              data-outgoing-image
            />
          )}
          <img
            key={generatedImage}
            src={generatedImage}
            data-preview-image
            alt="AI 產生的圖片"
            width={1536}
            height={1024}
            className={cn(
              "relative mx-auto h-auto max-h-[55svh] w-auto max-w-full rounded-lg object-contain shadow-xl transition-opacity duration-(--motion-enter) ease-emphasized",
              crossfading
                ? !swap.loaded && "opacity-0"
                : "animate-in fade-in zoom-in-95 motion-reduce:zoom-in-100",
              isRefining && "opacity-40"
            )}
            onError={() => setFailedImage(generatedImage)}
            onLoad={() => setSwap((current) => (current.image === generatedImage ? { ...current, loaded: true } : current))}
            onTransitionEnd={(event) => {
              if (event.propertyName === "opacity" && swap.loaded) setSwap((current) => ({ ...current, under: null }));
            }}
            decoding="async"
          />
          {isRefining && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg text-center"
              role="status"
              data-refining-overlay
            >
              <p className="text-sm font-semibold text-foreground">{generationStatus?.label || "AI 正在修改"}</p>
              {generationStatus?.helperText && (
                <p className="px-4 text-xs text-muted-foreground">{generationStatus.helperText}</p>
              )}
            </div>
          )}
          {isCompressedPreview && (
            <span className="absolute left-2 top-2 rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
              此為壓縮預覽
            </span>
          )}
        </div>
      )}

      {onRefine && (
        <RefineForm
          onRefine={onRefine}
          isRefining={isRefining}
          disabled={isGenerating || imageError}
          refineError={refineError}
        />
      )}

      <VersionStrip
        rows={versionRows}
        activeVersionId={activeVersionId}
        onSelectVersion={onSelectVersion}
        getVersionLabel={getVersionLabel}
        getVersion={getVersion}
      />

      {!imageError && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onExpand && (
            <button
              type="button"
              onClick={(event) => {
                const frame = event.currentTarget.closest("[data-image-preview]");
                const image = frame.querySelector("[data-preview-image]") || frame;
                onExpand(image.getBoundingClientRect());
              }}
              aria-label="展開畫布比較版本"
              className="mr-auto flex h-9 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 text-xs font-medium text-foreground press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Maximize2 className="icon-sm" aria-hidden="true" />
              <span className="whitespace-nowrap">展開比較</span>
            </button>
          )}
          <ShareToLineButton
            imageUrl={generatedImage}
            user={user}
            className="[&>button]:h-9 [&>button]:px-3 [&>button]:text-xs [&>button]:rounded-lg"
          />
          <button
            type="button"
            onClick={onDownload}
            aria-label="下載產生的圖片"
            className="flex h-9 items-center gap-1.5 rounded-lg border border-border/50 bg-background px-3 text-xs font-medium text-foreground press-feedback hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Save className="icon-sm" aria-hidden="true" />
            <span className="whitespace-nowrap">下載圖片</span>
          </button>
        </div>
      )}
    </div>
  );

  const renderContent = () => {
    if (isGenerating && !isRefining) return renderGeneratingState();
    if (generatedImage) return renderImageState();
    return renderEmptyState();
  };

  return (
    <div data-image-preview className="relative flex h-auto min-h-[260px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-background shadow-sm lg:min-h-[500px] lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
      {renderContent()}
    </div>
  );
}
