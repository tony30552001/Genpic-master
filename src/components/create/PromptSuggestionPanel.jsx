import React from "react";
import { Sparkles, Check, X, ArrowRight } from "lucide-react";

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
                <Sparkles className="w-4 h-4" />
                <span className="text-sm font-bold">AI 優化建議</span>
            </div>

            {/* AI Explanation */}
            {explanation && (
                <div className="px-4 pt-3 pb-1">
                    <p className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-lg leading-relaxed">
                        💡 {explanation}
                    </p>
                </div>
            )}

            {/* Comparison */}
            <div className="px-4 py-3 space-y-2">
                {/* Original */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            原始內容
                        </span>
                    </div>
                    <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2.5 leading-relaxed line-clamp-4 whitespace-pre-wrap">
                        {originalText || "(空白)"}
                    </div>
                </div>

                {/* Arrow */}
                <div className="flex justify-center py-0.5">
                    <ArrowRight className="w-4 h-4 text-primary/40 rotate-90" />
                </div>

                {/* Optimized */}
                <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                            優化後
                        </span>
                        <Sparkles className="w-3 h-3 text-primary/60" />
                    </div>
                    <div className="text-xs text-foreground bg-card border border-primary/20 rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-wrap shadow-sm max-h-48 overflow-y-auto custom-scrollbar">
                        {optimizedText}
                    </div>
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 px-4 py-3 border-t border-primary/10 bg-background/60">
                <button
                    onClick={onAccept}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-primary-foreground bg-primary hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-150 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring"
                >
                    <Check className="w-3.5 h-3.5" />
                    套用優化
                </button>
                <button
                    onClick={onReject}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground bg-muted hover:bg-muted/80 border border-border transition-all duration-150"
                >
                    <X className="w-3.5 h-3.5" />
                    取消
                </button>
            </div>
        </div>
    );
}
