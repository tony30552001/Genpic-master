import React from "react";
import { cn } from "@/lib/utils";
import { segmentStartLabel } from "@/lib/videoStoryboard";

const groupShots = (shots, segments) => {
  if (!segments || segments.length < 2) return [{ segment: null, shots }];
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  return segments.map((segment) => ({ segment, shots: segment.shotIds.map((id) => byId.get(id)).filter(Boolean) }));
};

/**
 * Proportional shot timeline; each block jumps to its shot card. When the
 * storyboard spans several segments, shots group under their segment.
 */
export default function StoryboardTimeline({ shots, segments, warnedIds, changedIds, onJump }) {
  const total = shots.reduce((sum, shot) => sum + shot.duration, 0);
  const groups = groupShots(shots, segments);
  const numberOf = new Map(shots.map((shot, index) => [shot.id, index + 1]));
  return (
    <div className="sticky top-0 z-10 -mx-5 bg-card/80 px-5 pb-2 pt-3 backdrop-blur-md backdrop-saturate-150 motion-reduce:backdrop-blur-none">
      <div className="flex gap-2">
        {groups.map(({ segment, shots: groupShotsList }) => (
          <div
            key={segment?.index ?? "all"}
            style={{ flexGrow: groupShotsList.reduce((sum, shot) => sum + shot.duration, 0) }}
            className="flex min-w-0 basis-0 flex-col gap-1"
          >
            <div className="flex h-8.5 gap-0.75">
              {groupShotsList.map((shot) => {
                const number = numberOf.get(shot.id);
                return (
                  <button
                    key={shot.id}
                    type="button"
                    style={{ flexGrow: shot.duration }}
                    className={cn(
                      "relative min-w-0 basis-0 overflow-hidden whitespace-nowrap rounded-lg border border-primary/25 bg-primary/12 text-[11px] font-semibold tabular-nums text-primary press-feedback hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      changedIds.includes(shot.id) && "bg-primary/25"
                    )}
                    onClick={() => onJump(shot.id)}
                    aria-label={`第 ${number} 幕，約 ${shot.duration} 秒${segment ? `，屬於第 ${segment.index + 1} 段` : ""}${warnedIds.has(shot.id) ? "，有提醒" : ""}`}
                  >
                    {number} · {shot.duration}s
                    {warnedIds.has(shot.id) && (
                      <span className="absolute right-1 top-1 size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
            {segment && (
              <p
                className="truncate text-[10px] tabular-nums text-muted-foreground"
                title={segmentStartLabel(segment)}
                aria-hidden="true"
              >
                <span className="font-semibold text-foreground">第 {segment.index + 1} 段</span> · {segment.durationSeconds}s
                {segment.index > 0 && ` · ${segment.chained ? "接續" : "新場景"}`}
              </p>
            )}
          </div>
        ))}
      </div>
      {groups.length === 1 && (
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
          <span>0s</span>
          <span>約 {Math.round(total / 3)}s</span>
          <span>約 {Math.round((total * 2) / 3)}s</span>
          <span>{total}s</span>
        </div>
      )}
    </div>
  );
}
