import React from "react";
import { Lightbulb } from "@/components/icons/lucideContent";
import { Button } from "@/components/ui/button";

/**
 * 規則型 prompt 提示卡；每則提示提供一個主要動作與「略過」。
 * @param {{ hints: Array<{ id: string, message: string, actionLabel: string, onAction: () => void, onDismiss: () => void }> }} props
 */
export default function PromptHints({ hints }) {
  if (!hints.length) return null;

  return (
    <div className="space-y-2">
      {hints.map((hint) => (
        <div
          key={hint.id}
          role="status"
          className="flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground animate-in fade-in slide-in-from-top-1 duration-(--motion-enter) ease-emphasized motion-reduce:slide-in-from-top-0 sm:flex-row sm:items-center"
        >
          <span className="flex min-w-0 flex-1 items-start gap-2">
            <Lightbulb className="icon-sm mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>{hint.message}</span>
          </span>
          <span className="flex shrink-0 gap-1.5 self-end sm:self-auto">
            <Button type="button" size="sm" className="h-8 px-3 text-xs" onClick={hint.onAction}>
              {hint.actionLabel}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={hint.onDismiss}>
              略過
            </Button>
          </span>
        </div>
      ))}
    </div>
  );
}
