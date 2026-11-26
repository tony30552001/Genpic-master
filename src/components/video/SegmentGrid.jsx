import React from "react";
import { Download, Grid2X2, Play } from "@/components/icons/lucideControls";
import { AlertCircle } from "@/components/icons/lucideStatus";
import { cn } from "@/lib/utils";
import { segmentStatusLabel } from "./videoStatus";

const MODES = [
  { value: "grid", label: "網格", Icon: Grid2X2 },
  { value: "player", label: "播放", Icon: Play },
];

/** Switches the segment view between the card grid and the sequential player. */
export function ViewModeToggle({ mode, onChange, dark = false }) {
  return (
    <div
      role="group"
      aria-label="分段檢視方式"
      className={cn("flex shrink-0 rounded-lg p-0.5", dark ? "bg-white/10" : "bg-muted")}
    >
      {MODES.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs press-feedback transition-colors duration-(--motion-hover) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mode === value
              ? dark ? "bg-white/20 font-semibold text-white" : "bg-card font-semibold text-foreground shadow-sm"
              : dark ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}

// Only one segment plays at a time.
const pauseOthers = (event) => {
  event.currentTarget
    .closest("[data-segment-grid]")
    ?.querySelectorAll("video")
    .forEach((video) => {
      if (video !== event.currentTarget) video.pause();
    });
};

function SegmentCard({ segment, url, dark }) {
  const failed = segment.status === "failed";
  const label = segment.status === "succeeded" ? "下載中" : segmentStatusLabel(segment);
  return (
    <li className="flex min-w-0 flex-col gap-1.5">
      <div
        className={cn(
          "relative aspect-video overflow-hidden rounded-xl",
          url ? "bg-black" : failed
            ? "border border-destructive/30 bg-destructive/5"
            : dark ? "bg-white/5" : "border border-border/70 bg-muted/50"
        )}
      >
        {url ? (
          <video
            src={url}
            controls
            playsInline
            preload="metadata"
            onPlay={pauseOthers}
            aria-label={`第 ${segment.index + 1} 段影片`}
            className="size-full object-contain animate-in fade-in duration-(--motion-enter) ease-emphasized"
          />
        ) : failed ? (
          <p className="flex size-full flex-col items-center justify-center gap-1.5 p-3 text-center text-xs text-destructive" role="alert">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span className="line-clamp-3">{segment.error?.message || "生成失敗"}</span>
          </p>
        ) : (
          <>
            <div className="image-generation-dots pointer-events-none absolute inset-0" aria-hidden="true" />
            <p className={cn("absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium", dark ? "text-white/80" : "text-foreground")}>
              <span className="image-generation-status-dot size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              {label}
            </p>
          </>
        )}
      </div>
      <div className={cn("flex min-w-0 items-center justify-between gap-2 px-0.5 text-xs", dark ? "text-white/80" : "text-muted-foreground")}>
        <span className="truncate tabular-nums">
          第 {segment.index + 1} 段{segment.durationSeconds ? ` · ${segment.durationSeconds} 秒` : ""}
        </span>
        {url && (
          <a
            href={url}
            download={`pixora-video-part-${segment.index + 1}.mp4`}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dark ? "hover:bg-white/10 hover:text-white" : "hover:bg-muted hover:text-foreground"
            )}
            aria-label={`下載第 ${segment.index + 1} 段`}
          >
            <Download className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Every segment of a turn as a card: finished segments play inline, the rest
 * show their queue, generation or failure state as they progress.
 */
export default function SegmentGrid({ turn, dark = false, className }) {
  return (
    <ul
      data-segment-grid
      aria-label="影片分段"
      className={cn("grid content-start gap-3 overflow-y-auto grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))]", className)}
    >
      {turn.segments.map((segment) => (
        <SegmentCard key={segment.index} segment={segment} url={turn.segmentUrls?.[segment.jobId]} dark={dark} />
      ))}
    </ul>
  );
}
