import React from "react";
import {
  X,
  ArrowRight,
} from "@/components/icons/lucideControls";
import {
  Check,
} from "@/components/icons/lucideStatus";
import {
  Sparkles,
} from "@/components/icons/lucideContent";
/**
 * PromptSuggestionPanel — AI 優化建議預覽面板
 * 顯示原始/優化後的文字比較與 AI 說明，讓使用者選擇套用或取消
 */
export default function PromptSuggestionPanel({
    originalText,
    optimizedText,
    explanation,
    onAccept,
    onReject,
}) {
    return (
        <div className="rounded-xl border border-primary/20 bg-primary/5 shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground">
                <Sparkles className="icon-sm" aria-hidden="true" />
                <span className="text-sm font-bold">AI 優化建議</span>
            </div>

            {/* AI Explanation */}
            {explanation && (
                <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-lg leading-relaxed">
                        {explanation}
                    </p>
                </div>
            )}

            {/* Comparison */}
            <div className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center sm:gap-3">
                {/* Original */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            原始內容
                        </span>
                    </div>
                    <div className="break-words rounded-lg border border-border bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground line-clamp-4 whitespace-pre-wrap">
                        {originalText || "(空白)"}
                    </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center py-0.5 sm:px-1">
                    <ArrowRight className="icon-sm rotate-90 text-primary/40 sm:rotate-0" aria-hidden="true" />
                </div>

                {/* Optimized */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                            優化後
                        </span>
                        <Sparkles className="icon-xs text-primary/60" aria-hidden="true" />
                    </div>
                    <div className="max-h-48 overflow-y-auto break-words rounded-lg border border-primary/20 bg-card px-3 py-2.5 text-xs leading-relaxed text-foreground shadow-sm whitespace-pre-wrap custom-scrollbar">
                        {optimizedText}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 border-t border-primary/10 bg-background/60 px-4 py-3 sm:flex-row sm:items-center">
                <button
                    type="button"
                    onClick={onAccept}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm transition-shadow duration-150 hover:bg-primary/90 hover:shadow-md active:scale-[0.98] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                    <Check className="icon-sm" aria-hidden="true" />
                    套用優化
                </button>
                <button
                    type="button"
                    onClick={onReject}
                    className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted px-4 py-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-auto"
                >
                    <X className="icon-sm" aria-hidden="true" />
                    取消
                </button>
            </div>
        </div>
    );
}
