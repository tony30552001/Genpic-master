import React from "react";
import {
  Monitor,
  Layout,
  Square,
  Smartphone,
} from "@/components/icons/lucideContent";
import {
  Loader2,
} from "@/components/icons/lucideStatus";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { getImageOutputLabel } from "@/lib/imageOutput";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IMAGE_MODEL_OPTIONS, IMAGE_QUALITY_OPTIONS } from "@/config";

const ASPECT_RATIOS = [
    { id: "16:9", label: "16:9 簡報", icon: Monitor },
    { id: "4:3", label: "4:3 傳統", icon: Layout },
    { id: "1:1", label: "1:1 社群", icon: Square },
    { id: "9:16", label: "9:16 手機", icon: Smartphone },
];

const IMAGE_SIZES = [
    { id: "1K", label: "1K" },
    { id: "2K", label: "2K" },
    { id: "4K", label: "4K" },
];

/**
 * 固定底部的生成控制列
 * 包含比例選擇、解析度選擇和主要的 CTA 生成按鈕
 */
export default function GenerateBar({
    aspectRatio,
    onAspectRatioChange,
    imageSize,
    onImageSizeChange,
    imageQuality,
    onImageQualityChange,
    imageModel,
    isGenerating,
    onGenerate,
    onCancelGeneration,
    generationStatus,
    buttonText,
    isGeneratingText,
    actionKind = "create",
    disabled = false,
}) {
    const modelConfig = IMAGE_MODEL_OPTIONS.find((m) => m.id === imageModel);
    const showResolutionPicker = !modelConfig?.supportsSizeMapping;
    const selectedSizeLabel = getImageOutputLabel({ aspectRatio });
    const generationLabel = generationStatus
        ? `${generationStatus.shortLabel} · ${generationStatus.elapsedLabel}`
        : isGeneratingText || "AI 生成中…";

    return (
        <div className="shrink-0 space-y-3 border-t border-border bg-card px-4 py-3 shadow-[0_-10px_24px_hsl(var(--foreground)/0.08)] ring-1 ring-border/40">
            <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold text-foreground">輸出設定</p>
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {modelConfig?.label || "自訂模型"} · {selectedSizeLabel}
                </p>
            </div>

            <div className="flex items-center gap-3">
                {/* Aspect Ratios */}
                <div className="flex flex-1 gap-1 rounded-lg border border-border/70 bg-muted/70 p-1 shadow-inner">
                    {ASPECT_RATIOS.map((ratio) => (
                        <button
                            type="button"
                            key={ratio.id}
                            onClick={() => onAspectRatioChange(ratio.id)}
                            aria-label={`設定圖片比例為 ${ratio.label}`}
                            aria-pressed={aspectRatio === ratio.id}
                            className={cn(
                                "min-h-11 flex-1 touch-manipulation flex items-center justify-center gap-1 rounded-md px-1 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted",
                                aspectRatio === ratio.id
                                     ? "bg-background text-primary font-semibold shadow-sm ring-1 ring-border/60"
                                     : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                            )}
                            title={ratio.label}
                        >
                            <ratio.icon className="icon-sm" aria-hidden="true" />
                            <span className="hidden lg:inline">{ratio.id}</span>
                        </button>
                    ))}
                </div>

                <Separator orientation="vertical" className="h-6" />

                {showResolutionPicker ? (
                    /* 非 gpt-image-2：傳統 1K/2K/4K 解析度選擇 */
                    <div className="flex gap-1">
                        {IMAGE_SIZES.map((size) => (
                            <button
                                type="button"
                                key={size.id}
                                onClick={() => onImageSizeChange(size.id)}
                                aria-label={`設定圖片解析度為 ${size.label}`}
                                aria-pressed={imageSize === size.id}
                                className={cn(
                                    "min-h-11 min-w-11 touch-manipulation rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                                    imageSize === size.id
                                        ? "bg-background text-primary font-semibold shadow-sm ring-1 ring-border/60"
                                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                                )}
                                title={size.label}
                            >
                                {size.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    /* gpt-image-2：低/中/高 渲染品質 */
                    <div
                        className="flex gap-1 rounded-lg border border-border/70 bg-muted/70 p-1 shadow-inner"
                        role="group"
                        aria-label="圖片品質"
                    >
                        {IMAGE_QUALITY_OPTIONS.map((option) => (
                            <button
                                type="button"
                                key={option.id}
                                onClick={() => onImageQualityChange(option.id)}
                                aria-label={`設定圖片品質為${option.label}`}
                                aria-pressed={imageQuality === option.id}
                                className={cn(
                                    "min-h-11 min-w-11 touch-manipulation rounded-md px-2.5 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted",
                                    imageQuality === option.id
                                        ? "bg-background text-primary font-semibold shadow-sm ring-1 ring-border/60"
                                        : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                                )}
                                title={option.description}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {isGenerating && generationStatus && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/45 px-3 py-2 shadow-inner" aria-live="polite">
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground">{generationStatus.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                            已等待 {generationStatus.elapsedLabel}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
                            style={{ width: `${generationStatus.progress}%` }}
                        />
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        {generationStatus.helperText}
                    </p>
                </div>
            )}

            {/* Generate CTA */}
            <div className="flex gap-2">
                <Button
                    onClick={onGenerate}
                    disabled={disabled || isGenerating}
                    size="lg"
                    className={cn(
                        "flex-1 text-sm font-bold shadow-md transition-shadow hover:shadow-lg active:scale-[0.98] motion-reduce:transform-none",
                        "bg-primary hover:bg-primary/90 text-primary-foreground",
                        "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
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
                            <ProductGlyph kind={actionKind} active className="icon-md" aria-hidden="true" />
                            {buttonText || "開始生成圖片"}
                        </span>
                    )}
                </Button>
                {isGenerating && onCancelGeneration && (
                    <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={onCancelGeneration}
                        className="shrink-0 px-4"
                    >
                        取消
                    </Button>
                )}
            </div>
        </div>
    );
}
