import React from "react";
import { segmentStartLabel } from "@/lib/videoStoryboard";

/** Marks where a new segment (one model request) starts in the shot list. */
export default function SegmentDivider({ segment }) {
  return (
    <div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground">
      <span className="shrink-0 font-semibold text-foreground">第 {segment.index + 1} 段</span>
      <span className="shrink-0 tabular-nums">{segment.durationSeconds} 秒</span>
      <span className="min-w-0 truncate">· {segmentStartLabel(segment)}</span>
      <span className="h-px min-w-4 flex-1 bg-border" aria-hidden="true" />
    </div>
  );
}
