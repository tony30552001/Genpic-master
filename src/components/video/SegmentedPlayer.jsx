import React, { useState } from "react";
import { Download } from "@/components/icons/lucideControls";
import { cn } from "@/lib/utils";
import { videoDownloadUrl } from "@/services/aiService";
import VideoStream from "./VideoStream";

/**
 * Plays a project's segment videos in order, advancing when one ends. With
 * several segments, a segment picker and a per-segment download sit below.
 */
export default function SegmentedPlayer({ sources, autoPlay = false, dark = false, className, videoClassName }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(autoPlay);
  const multiple = sources.length > 1;
  const source = sources[index] || sources[0];
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <VideoStream
        key={source.jobId || source.projectId}
        {...source}
        controls
        playsInline
        autoPlay={playing}
        onPlay={() => setPlaying(true)}
        onEnded={() => {
          if (index < sources.length - 1) setIndex(index + 1);
          else setPlaying(false);
        }}
        className={cn("min-h-0 w-full flex-1 object-contain", videoClassName)}
      />
      {multiple && (
        <div className={cn("flex shrink-0 items-center gap-1.5 px-3 py-2", dark ? "text-white" : "border-t border-border bg-card/90")}>
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="group" aria-label="影片分段">
            {sources.map((segment, segmentIndex) => (
              <button
                key={segment.jobId}
                type="button"
                className={cn(
                  "h-8 shrink-0 rounded-lg px-2.5 text-xs tabular-nums press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  segmentIndex === index
                    ? dark ? "bg-white/20 font-semibold" : "bg-primary/12 font-semibold text-primary"
                    : dark ? "text-white/70 hover:bg-white/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setIndex(segmentIndex)}
                aria-pressed={segmentIndex === index}
              >
                第 {segmentIndex + 1} 段
              </button>
            ))}
          </div>
          <a
            href={videoDownloadUrl(source)}
            download={`pixora-video-part-${index + 1}.mp4`}
            className={cn(
              "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dark ? "hover:bg-white/10" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Download className="size-3.5" aria-hidden="true" />下載第 {index + 1} 段
          </a>
        </div>
      )}
    </div>
  );
}
