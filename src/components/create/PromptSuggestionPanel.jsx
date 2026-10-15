import React, { useId } from "react";
import { ChevronDown } from "@/components/icons/lucideControls";
import { Check } from "@/components/icons/lucideStatus";
import { Sparkles } from "@/components/icons/lucideContent";

/**
 * PromptSuggestionPanel — AI 優化建議預覽面板
 * 以優化後文字為主體，原文收在可展開的對照區，讓使用者決定套用或保留原文
 */
export default function PromptSuggestionPanel({
    originalText,
    optimizedText,
    explanation,
    onAccept,
    onReject,
}) {
    const titleId = useId();

    return (
        <section
            aria-labelledby={titleId}
            className="overflow-hidden rounded-xl border border-border bg-card shadow-sm ring-1 ring-primary/10 animate-in fade-in slide-in-from-top-1 duration-(--motion-enter) ease-emphasized motion-reduce:slide-in-from-top-0"
        >
            <header className="space-y-1 px-4 pt-3.5">
                <h3 id={titleId} className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Sparkles className="icon-sm text-primary" aria-hidden="true" />
                    AI 優化建議
                </h3>
                {explanation && (
                    <p className="text-xs leading-relaxed text-muted-foreground">{explanation}</p>
                )}
            </header>

            <div className="space-y-2 px-4 py-3">
                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted/40 px-3.5 py-3 text-sm leading-7 text-foreground custom-scrollbar">
                    {optimizedText}
                </p>

                <details className="group">
                    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 rounded-md px-1 text-xs font-medium text-muted-foreground transition-colors duration-(--motion-hover) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                        <ChevronDown
                            className="icon-xs -rotate-90 transition-transform duration-(--motion-hover) ease-emphasized group-open:rotate-0"
                            aria-hidden="true"
                        />
                        對照原始內容
                    </summary>
                    <p className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-l-2 border-border pl-3 text-xs leading-relaxed text-muted-foreground custom-scrollbar">
                        {originalText || "(空白)"}
                    </p>
                </details>
            </div>

            <footer className="flex flex-col-reverse gap-2 border-t border-border/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                    type="button"
                    onClick={onReject}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg px-3.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:min-h-0"
                >
                    保留原文
                </button>
                <button
                    type="button"
                    onClick={onAccept}
                    className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:h-9 sm:min-h-0"
                >
                    <Check className="icon-sm" aria-hidden="true" />
                    套用優化
                </button>
            </footer>
        </section>
    );
}
