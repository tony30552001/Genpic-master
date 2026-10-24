import React, { useState } from "react";
import { AnimatePresence } from "motion/react";
import { SlidersHorizontal } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Sparkles } from "@/components/icons/lucideContent";
import MobileSheet from "@/components/common/MobileSheet";
import { getImageOutputLabel } from "@/lib/imageOutput";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IMAGE_QUALITY_LABELS } from "@/config";
import { getImageQualityError } from "@/lib/imageModel";
import { getImageTextModeLabel } from "@/lib/imageTextLanguage";
import OutputSettings from "./OutputSettings";

function GenerationProgress({ generationStatus, compact = false }) {
    return (
        <div
            className={cn(
                "space-y-2 rounded-lg border border-border bg-muted/45 px-3 py-2 shadow-inner",
                compact && "min-w-0 flex-1 space-y-1.5 py-1.5"
            )}
            aria-live="polite"
        >
            <div className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate font-medium text-foreground">{generationStatus.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                    {compact ? generationStatus.elapsedLabel : `已等待 ${generationStatus.elapsedLabel}`}
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${generationStatus.progress}%` }}
                />
            </div>
            {!compact && (
                <p className="text-xs leading-relaxed text-muted-foreground">{generationStatus.helperText}</p>
            )}
        </div>
    );
}

/**
 * 固定底部的生成控制列。
 * 桌面版是單列：比例、品質、圖中文字之後緊接生成按鈕，模型摘要靠右；`compact`（手機版）只留結果縮圖、設定摘要與生成按鈕，
 * 設定收進底部面板。
 */
export default function GenerateBar({
    aspectRatio,
    onAspectRatioChange,
    imageQuality,
    onImageQualityChange,
    imageModelConfig,
    imageLanguage,
    onImageLanguageChange,
    configurationError,
    isGenerating,
    onGenerate,
    onCancelGeneration,
    generationStatus,
    buttonText,
    isGeneratingText,
    ActionIcon = Sparkles,
    disabled = false,
    aspectRatioLocked = false,
    onSuggestRefine,
    compact = false,
    resultImage,
    onOpenResult,
}) {
    const [settingsOpen, setSettingsOpen] = useState(false);
    const quality = imageQuality === undefined ? imageModelConfig?.defaultQuality : imageQuality;
    const setupError = configurationError || getImageQualityError(imageModelConfig, quality);
    const supportedQualities = Array.isArray(imageModelConfig?.supportedQualities)
        ? imageModelConfig.supportedQualities
        : [];
    const selectedSizeLabel = aspectRatioLocked ? "沿用原圖比例" : getImageOutputLabel({ aspectRatio });
    const generationLabel = generationStatus
        ? `${generationStatus.shortLabel} · ${generationStatus.elapsedLabel}`
        : isGeneratingText || "AI 生成中…";
    const canGenerate = !disabled && !isGenerating && !setupError;

    const settings = (layout) => (
        <OutputSettings
            layout={layout}
            aspectRatio={aspectRatio}
            onAspectRatioChange={onAspectRatioChange}
            aspectRatioLocked={aspectRatioLocked}
            quality={quality}
            supportedQualities={supportedQualities}
            onImageQualityChange={onImageQualityChange}
            imageLanguage={imageLanguage}
            onImageLanguageChange={onImageLanguageChange}
        />
    );

    const setupMessage = setupError ? (
        <p role="alert" className="text-xs text-destructive">{setupError}</p>
    ) : (
        <p className="text-xs text-muted-foreground">較高品質可能增加生成時間與費用。</p>
    );

    const refineHint = onSuggestRefine && !isGenerating && (
        <button
            type="button"
            onClick={onSuggestRefine}
            className="w-full rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-left text-xs text-foreground transition-colors duration-(--motion-hover) hover:bg-primary/10 active:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
            只改一小部分？用「修改這張」，構圖會保留。
        </button>
    );

    const generateButton = (label, className, beforeGenerate) => (
        <Button
            onClick={() => {
                if (!canGenerate) return;
                beforeGenerate?.();
                onGenerate();
            }}
            disabled={!canGenerate}
            size="lg"
            className={cn(
                "text-sm font-bold shadow-md hover:shadow-lg",
                "bg-primary hover:bg-primary/90 text-primary-foreground",
                "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
                className
            )}
        >
            {isGenerating ? (
                <span className="flex items-center gap-2">
                    <Loader2
                        className="icon-md animate-spin motion-reduce:animate-none"
                        data-generation-spinner
                        aria-hidden="true"
                    />
                    {generationLabel}
                </span>
            ) : (
                <span className="flex items-center gap-2">
                    <ActionIcon className="icon-md" aria-hidden="true" />
                    {label}
                </span>
            )}
        </Button>
    );

    const cancelButton = isGenerating && onCancelGeneration && (
        <Button type="button" variant="outline" size="lg" onClick={onCancelGeneration} className="shrink-0 px-4">
            取消
        </Button>
    );

    if (compact) {
        const summary = [
            aspectRatioLocked ? "原圖比例" : aspectRatio,
            IMAGE_QUALITY_LABELS[quality] || quality,
            onImageLanguageChange && getImageTextModeLabel(imageLanguage),
        ].filter(Boolean).join(" · ");

        return (
            <div className="shrink-0 space-y-2 border-t border-border bg-card px-3 py-2 shadow-[0_-10px_24px_hsl(var(--foreground)/0.08)]">
                {setupError && <p role="alert" className="text-xs text-destructive">{setupError}</p>}
                {refineHint}
                <div className="flex items-center gap-2">
                    {resultImage && !isGenerating && (
                        <button
                            type="button"
                            onClick={onOpenResult}
                            aria-label="查看生成結果"
                            className="size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <img src={resultImage} alt="" className="size-full object-cover" decoding="async" />
                        </button>
                    )}
                    {isGenerating && generationStatus ? (
                        <GenerationProgress generationStatus={generationStatus} compact />
                    ) : (
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(true)}
                            aria-haspopup="dialog"
                            aria-label={`輸出設定：${summary}`}
                            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border/70 bg-muted/70 px-3 text-left text-xs text-foreground press-feedback active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <SlidersHorizontal className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="truncate">{summary}</span>
                        </button>
                    )}
                    {isGenerating ? cancelButton : generateButton("生成", "shrink-0 px-5")}
                </div>

                <AnimatePresence>
                    {settingsOpen && (
                        <MobileSheet
                            title="輸出設定"
                            onClose={() => setSettingsOpen(false)}
                            footer={(close) => (
                                <div className="space-y-2">
                                    <p className="text-center text-xs text-muted-foreground">
                                        {imageModelConfig?.label || "尚未設定圖片模型"} · {selectedSizeLabel}
                                    </p>
                                    {generateButton(buttonText || "開始生成圖片", "w-full", close)}
                                </div>
                            )}
                        >
                            <div className="space-y-4">
                                {settings("stack")}
                                {setupMessage}
                            </div>
                        </MobileSheet>
                    )}
                </AnimatePresence>
            </div>
        );
    }

    return (
        <div className="shrink-0 space-y-2 border-t border-border bg-card px-8 py-3 shadow-[0_-10px_24px_hsl(var(--foreground)/0.08)] ring-1 ring-border/40">
            {setupError && <p role="alert" className="text-xs text-destructive">{setupError}</p>}
            {isGenerating && generationStatus && <GenerationProgress generationStatus={generationStatus} />}
            {refineHint}

            {/* 設定與生成按鈕是同一個動作的前後兩步，緊鄰排列；模型摘要是次要資訊，靠右。 */}
            <div className="flex items-center gap-3">
                <div className="min-w-0">{settings("row")}</div>
                {generateButton(buttonText || "開始生成圖片", "h-11 w-56 shrink-0")}
                {cancelButton}
                <p className="ml-auto hidden max-w-60 truncate pl-3 text-right text-xs text-muted-foreground xl:block">
                    {imageModelConfig?.label || "尚未設定圖片模型"} · {selectedSizeLabel}
                </p>
            </div>
        </div>
    );
}
