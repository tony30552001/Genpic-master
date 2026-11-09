import React, { useState } from "react";
import {
  Download,
  Maximize2,
  Paintbrush,
} from "@/components/icons/lucideControls";
import {
  Image as ImageIcon,
} from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";
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

const ICON_BUTTON_CLASS = "size-9 rounded-[10px] text-muted-foreground [&_svg]:size-[18px]";
// Both images share one grid cell, so the outgoing image sits exactly under the incoming one.
const STAGE_IMAGE_CLASS = "col-start-1 row-start-1 max-h-[60svh] max-w-full rounded-lg object-contain lg:max-h-full";

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
  onPreciseEdit,
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
  const activeVersion = activeVersionId && getVersion ? getVersion(activeVersionId) : null;

  // 狀態 1：生成中畫面（修改中則保留目前圖片）
  const renderGeneratingState = () => (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <ImageGeneratingState
        aspectRatio={aspectRatio}
        generationStatus={generationStatus}
        promptSummary={promptSummary}
        resolutionLabel={getImageOutputLabel({ aspectRatio })}
      />
    </div>
  );

  // 狀態 2：空白初始畫面
  const renderEmptyState = () => (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-card",
          getEmptyFrameClass(aspectRatio)
        )}
        aria-hidden="true"
      >
        <ImageIcon className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">預覽區已準備好</p>
        <p className="text-xs text-balance text-muted-foreground">
          目前比例為 {aspectRatio}。完成內容與風格設定後，生成結果會出現在這裡。
        </p>
      </div>
    </div>
  );

  const renderHeader = () => (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-card pl-4 pr-2.5">
      <div className="mr-auto min-w-0 leading-tight">
        <p className="text-sm font-bold text-foreground">
          {activeVersion && getVersionLabel ? getVersionLabel(activeVersion) : "生成結果"}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {activeVersion?.parentId ? activeVersion.instruction : "原始生成"}
        </p>
      </div>
      {onPreciseEdit && !imageError && (
        <Button
          type="button"
          variant="outline"
          onClick={onPreciseEdit}
          disabled={isGenerating}
          aria-label="精確編輯"
          className="mr-1 h-[34px] shrink-0 gap-1.5 rounded-full px-3 text-[13px] font-semibold"
        >
          <Paintbrush aria-hidden="true" />
          <span className="hidden sm:inline">精確編輯</span>
        </Button>
      )}
      {onExpand && !imageError && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={(event) => {
            const frame = event.currentTarget.closest("[data-image-preview]");
            const image = frame.querySelector("[data-preview-image]") || frame;
            onExpand(image.getBoundingClientRect());
          }}
          aria-label="展開畫布比較版本"
          title="展開比較"
          className={ICON_BUTTON_CLASS}
        >
          <Maximize2 aria-hidden="true" />
        </Button>
      )}
      {!imageError && <ShareToLineButton imageUrl={generatedImage} user={user} />}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onDownload}
        aria-label="下載產生的圖片"
        title="下載圖片"
        className={ICON_BUTTON_CLASS}
      >
        <Download aria-hidden="true" />
      </Button>
    </header>
  );

  // 狀態 3：圖片展示畫面：上方工具列、左側版本欄、中間畫布、下方修改列
  const renderImageState = () => (
    <>
      {renderHeader()}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <VersionStrip
          rail
          className="order-last px-3 pb-2 lg:order-first"
          rows={versionRows}
          activeVersionId={activeVersionId}
          onSelectVersion={onSelectVersion}
        />
        {imageError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-destructive">
            <ImageIcon className="icon-display opacity-50" aria-hidden="true" />
            <p className="text-sm font-medium">圖片載入失敗，請嘗試重新下載或重新產生。</p>
          </div>
        ) : (
          <div
            className="grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] place-items-center p-3 lg:p-6"
            aria-busy={isRefining}
          >
            {crossfading && (
              <img src={swap.under} alt="" aria-hidden="true" className={STAGE_IMAGE_CLASS} data-outgoing-image />
            )}
            <img
              key={generatedImage}
              src={generatedImage}
              data-preview-image
              alt="AI 產生的圖片"
              width={1536}
              height={1024}
              className={cn(
                STAGE_IMAGE_CLASS,
                "relative h-auto w-auto shadow-xl transition-opacity duration-(--motion-enter) ease-emphasized",
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
                className="relative col-start-1 row-start-1 flex flex-col items-center justify-center gap-1 text-center"
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
              <span className="relative col-start-1 row-start-1 self-start justify-self-start rounded-md bg-background/90 px-2 py-0.5 text-[11px] font-medium text-muted-foreground shadow-sm">
                此為壓縮預覽
              </span>
            )}
          </div>
        )}
      </div>
      {onRefine && (
        <RefineForm
          className="shrink-0 px-3 pb-3 lg:mx-auto lg:w-full lg:max-w-3xl lg:px-6 lg:pb-5"
          onRefine={onRefine}
          isRefining={isRefining}
          disabled={isGenerating || imageError}
          refineError={refineError}
        />
      )}
    </>
  );

  const renderContent = () => {
    if (isGenerating && !isRefining) return renderGeneratingState();
    if (generatedImage) return renderImageState();
    return renderEmptyState();
  };

  return (
    <div
      data-image-preview
      className="relative flex min-h-[260px] w-full flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm lg:h-full lg:min-h-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none"
    >
      {renderContent()}
    </div>
  );
}
