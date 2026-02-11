import React from "react";
import { Monitor, Layout, Square, Smartphone, Wand2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

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
    isGenerating,
    onGenerate,
    buttonText,
    isGeneratingText,
    disabled = false,
}) {
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
                            <span className="hidden xl:inline">{ratio.id}</span>
                        </button>
                    ))}
                </div>

                <Separator orientation="vertical" className="h-6" />

                {/* Resolution */}
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
            </div>

            {/* Generate CTA */}
            <Button
                onClick={onGenerate}
                disabled={disabled || isGenerating}
                size="lg"
                className={cn(
                    "w-full font-bold text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98]",
                    "bg-gradient-to-r from-blue-600 to-sky-500 hover:from-blue-700 hover:to-sky-600",
                    "disabled:from-muted disabled:to-muted disabled:text-muted-foreground disabled:shadow-none"
                )}
            >
                {isGenerating ? (
                    <span className="flex items-center gap-2">
                        <Loader2 className="w-5 h-5 animate-spin" /> {isGeneratingText || "AI 生成中..."}
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <Wand2 className="w-5 h-5" /> {buttonText || "開始生成圖片"}
                    </span>
                )}
            </Button>
        </div>
    );
}
