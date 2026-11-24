import React from "react";
import { cn } from "@/lib/utils";

/** Proportional shot timeline; each block jumps to its shot card. */
export default function StoryboardTimeline({ shots, warnedIds, changedIds, onJump }) {
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  return (
    <div className="sticky top-0 z-10 -mx-5 bg-card/80 px-5 pb-2 pt-3 backdrop-blur-md backdrop-saturate-150 motion-reduce:backdrop-blur-none">
      <div className="flex h-8.5 gap-0.75">
        {shots.map((shot, index) => (
          <button
            key={shot.id}
            type="button"
            style={{ flexGrow: shot.duration }}
            className={cn(
              "relative min-w-0 basis-0 overflow-hidden whitespace-nowrap rounded-lg border border-primary/25 bg-primary/12 text-[11px] font-semibold tabular-nums text-primary press-feedback hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              changedIds.includes(shot.id) && "bg-primary/25"
            )}
            onClick={() => onJump(shot.id)}
            aria-label={`第 ${index + 1} 幕，約 ${shot.duration} 秒${warnedIds.has(shot.id) ? "，有提醒" : ""}`}
          >
            {index + 1} · {shot.duration}s
            {warnedIds.has(shot.id) && (
              <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            )}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
        <span>0s</span>
        <span>約 {Math.round(total / 3)}s</span>
        <span>約 {Math.round((total * 2) / 3)}s</span>
        <span>{total}s</span>
      </div>
    </div>
  );
}
