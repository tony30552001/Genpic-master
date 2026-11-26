import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONES } from "./storyboardActions";

export function StatusPill({ tone, children }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONES[tone])}>
      {children}
    </span>
  );
}

/** A shot the agent has finished writing, shown read-only until the whole storyboard arrives. */
export function PartialShotCard({ shot, index, compact = false }) {
  return (
    <article
      className={cn(
        "storyboard-enter flex shrink-0 items-start gap-3 rounded-2xl border border-border bg-card px-3 py-2.5",
        !compact && "min-h-24"
      )}
      aria-label={`第 ${index + 1} 幕（擬稿中）`}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold tabular-nums text-primary">
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
          {shot.title && <span className="truncate font-medium text-foreground">{shot.title}</span>}
          {shot.duration != null && <span className="shrink-0 tabular-nums">{shot.duration} 秒</span>}
        </span>
        <span className={cn("text-[13px] text-muted-foreground", compact ? "line-clamp-2" : "line-clamp-3")}>{shot.text}</span>
      </span>
    </article>
  );
}

/** Finished shots so far, then placeholders for the ones still being written. */
export function DraftingShots({ progress, compact = false }) {
  const shots = progress?.shots || [];
  const expected = progress?.expectedShots;
  const remaining = expected ? Math.max(expected - shots.length, 0) : shots.length ? 1 : compact ? 4 : 5;
  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-2.5")}>
      {shots.map((shot, index) => (
        <PartialShotCard key={index} shot={shot} index={index} compact={compact} />
      ))}
      {remaining > 0 && <StoryboardSkeleton count={remaining} className={compact ? "gap-2 [&>div]:h-16" : undefined} />}
    </div>
  );
}

export function StoryboardSkeleton({ count = 5, className }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="storyboard-skeleton h-24 shrink-0 rounded-2xl border border-border" style={{ "--i": index }} />
      ))}
    </div>
  );
}
