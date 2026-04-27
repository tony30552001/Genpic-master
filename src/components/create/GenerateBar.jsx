import React from "react";
import { Monitor, Layout, Square, Smartphone, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { IMAGE_MODEL_OPTIONS } from "@/config";

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

// gpt-image-2 的 aspectRatio → 像素尺寸映射（僅顯示用）
const GPT_IMAGE_SIZE_LABELS = {
    "16:9": "1536×1024",
    "4:3": "1536×1024",
    "1:1": "1024×1024",
    "9:16": "1024×1536",
};

/**
 * 固定底部的生成控制列
 * 包含比例選擇、解析度選擇和主要的 CTA 生成按鈕
 */
export default function GenerateBar({
    aspectRatio,
    onAspectRatioChange,
    imageSize,
    onImageSizeChange,
    imageModel,
    isGenerating,
    onGenerate,
    onCancelGeneration,
    generationStatus,
    buttonText,
    isGeneratingText,
    disabled = false,
}) {
    const modelConfig = IMAGE_MODEL_OPTIONS.find((m) => m.id === imageModel);
    const showResolutionPicker = !modelConfig?.supportsSizeMapping;
    const generationLabel = generationStatus
        ? `${generationStatus.shortLabel} · ${generationStatus.elapsedLabel}`
        : isGeneratingText || "AI 生成中...";

    return (
        <div className="shrink-0 border-t border-border bg-card px-4 py-3 space-y-3">
            {/* Aspect Ratio & Resolution Row */}
            <div className="flex items-center gap-3">
                {/* Aspect Ratios */}
                <div className="flex gap-1 p-1 bg-muted rounded-lg flex-1">
                    {ASPECT_RATIOS.map((ratio) => (
                        <button
                            key={ratio.id}
                            onClick={() => onAspectRatioChange(ratio.id)}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-1 py-1.5 text-xs rounded-md transition-all",
                                aspectRatio === ratio.id
                                    ? "bg-background text-primary font-semibold shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                            )}
                            title={ratio.label}
                        >
                            <ratio.icon className="w-3.5 h-3.5" />
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
                                key={size.id}
                                onClick={() => onImageSizeChange(size.id)}
                                className={cn(
                                    "px-2.5 py-1.5 rounded-md text-xs transition-all",
                                    imageSize === size.id
                                        ? "bg-background text-primary font-semibold shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                                )}
                                title={size.label}
                            >
                                {size.label}
                            </button>
                        ))}
                    </div>
                ) : (
                    /* gpt-image-2：顯示自動映射的像素尺寸 */
                    <div className="px-2.5 py-1.5 rounded-md text-xs text-muted-foreground bg-muted/50">
                        {GPT_IMAGE_SIZE_LABELS[aspectRatio] || "1024×1024"}
                    </div>
                )}
            </div>

            {isGenerating && generationStatus && (
                <div className="space-y-2 rounded-lg border border-border/60 bg-muted/35 px-3 py-2" aria-live="polite">
                    <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="font-medium text-foreground">{generationStatus.label}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                            已等待 {generationStatus.elapsedLabel}
                        </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
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
                        "flex-1 font-bold text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]",
                        "bg-primary hover:bg-primary/90 text-primary-foreground",
                        "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
                    )}
                >
                    {isGenerating ? (
                        <span className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" /> {generationLabel}
                        </span>
                    ) : (
                        <span className="flex items-center gap-2">
                            <Wand2 className="w-5 h-5" /> {buttonText || "開始生成圖片"}
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
