import React from "react";
import { Clapperboard } from "@/components/icons/lucideContent";
import { cn } from "@/lib/utils";

/** Compact chat stand-in for a storyboard; opens it on the canvas. */
export default function StoryboardSummaryCard({ summary, subtitle, active = false, onOpen, className }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex h-16 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left press-feedback hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary/50 ring-1 ring-primary/20",
        className
      )}
      aria-label={`開啟分鏡「${summary.title}」，${summary.shots.length} 幕 ${summary.seconds} 秒`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Clapperboard className="size-4.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-[13px] font-semibold">
          {summary.title} · {summary.shots.length} 幕 · {summary.seconds} 秒
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="flex shrink-0 gap-1" aria-hidden="true">
            {summary.shots.map((shot) => (
              <span key={shot.id} className={cn("size-1.5 rounded-full", shot.warned ? "bg-amber-500" : "bg-primary/60")} />
            ))}
          </span>
          <span className="truncate">{subtitle}</span>
        </span>
      </span>
    </button>
  );
}
