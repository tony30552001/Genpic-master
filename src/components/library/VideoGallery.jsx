import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, FileText } from "@/components/icons/lucideContent";
import { Download, Trash2, X } from "@/components/icons/lucideControls";
import { AlertCircle, Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadVideo, downloadVideoSubtitles, getVideoPlayback } from "@/services/aiService";

// Signed playback URLs live for an hour; renew them five minutes early.
const PLAYBACK_RENEW_MARGIN_MS = 5 * 60 * 1000;
const playbacks = new Map();

const loadPlayback = (projectId) => {
  const cached = playbacks.get(projectId);
  if (cached && (!cached.expiresAt || cached.expiresAt - Date.now() > PLAYBACK_RENEW_MARGIN_MS)) return cached.promise;
  const entry = { expiresAt: 0 };
  entry.promise = getVideoPlayback({ projectId }).then(
    (playback) => {
      entry.expiresAt = Date.parse(playback.expiresAt);
      return playback.url;
    },
    (caught) => {
      playbacks.delete(projectId);
      throw caught;
    }
  );
  playbacks.set(projectId, entry);
  return entry.promise;
};

const formatDuration = (seconds) => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const saveBlob = (blob, filename) => {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 0);
};

function VideoCard({ item, onOpen }) {
  const ref = useRef(null);
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [frameReady, setFrameReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      loadPlayback(item.videoProjectId).then(
        (value) => !cancelled && setUrl(value),
        () => !cancelled && setFailed(true)
      );
    }, { rootMargin: "200px" });
    observer.observe(ref.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [item.videoProjectId]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(item)}
      className="group overflow-hidden rounded-2xl border border-border bg-card text-left press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-dot-grid bg-size-[18px_18px] text-muted-foreground">
        {failed ? (
          <span className="flex flex-col items-center gap-1 text-xs">
            <AlertCircle className="size-6" aria-hidden="true" />無法載入預覽
          </span>
        ) : (
          <Clapperboard className="size-10" aria-hidden="true" />
        )}
        {url && !failed && (
          <video
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            disablePictureInPicture
            tabIndex={-1}
            aria-hidden="true"
            onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
            onLoadedData={() => setFrameReady(true)}
            onError={() => setFailed(true)}
            className={cn(
              "pointer-events-none absolute inset-0 size-full bg-black object-cover opacity-0 transition-opacity duration-200 ease-out motion-reduce:transition-none",
              frameReady && "opacity-100"
            )}
          />
        )}
        {duration > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
            {formatDuration(duration)}
          </span>
        )}
      </span>
      <span className="block p-3">
        <span className="line-clamp-2 text-sm font-medium">{item.userScript || "未命名影片"}</span>
        <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{item.model}</span>
          {item.hasSubtitles && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">SRT 字幕</span>
          )}
        </span>
      </span>
    </button>
  );
}

function VideoPlayerDialog({ item, onClose, onDelete }) {
  const [url, setUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadingSrt, setDownloadingSrt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPlayback(item.videoProjectId).then(
      (value) => !cancelled && setUrl(value),
      (caught) => !cancelled && setError(caught.message || "影片載入失敗")
    );
    return () => {
      cancelled = true;
    };
  }, [item.videoProjectId]);

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      saveBlob(await downloadVideo({ projectId: item.videoProjectId }), `pixora-${item.id}.mp4`);
    } catch (caught) {
      setError(caught.message || "影片下載失敗");
    } finally {
      setDownloading(false);
    }
  };

  const downloadSrt = async () => {
    setDownloadingSrt(true);
    setError("");
    try {
      saveBlob(await downloadVideoSubtitles({ projectId: item.videoProjectId }), `pixora-${item.id}.srt`);
    } catch (caught) {
      setError(caught.message || "字幕下載失敗");
    } finally {
      setDownloadingSrt(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3" role="dialog" aria-modal="true" aria-label="影片詳情">
      <div className="flex items-center justify-end gap-2">
        {item.hasSubtitles && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-white hover:bg-white/10 hover:text-white"
            aria-label={downloadingSrt ? "正在下載字幕" : "下載字幕 (.srt)"}
            disabled={downloadingSrt}
            onClick={() => void downloadSrt()}
          >
            {downloadingSrt ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : <FileText className="size-3.5" aria-hidden="true" />}
            下載字幕 (.srt)
          </Button>
        )}
        <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label={downloading ? "正在下載影片" : "下載影片"} disabled={downloading} onClick={() => void download()}>
          {downloading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        </Button>
        <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="刪除影片紀錄" onClick={async () => {
          await onDelete(item.id);
          onClose();
        }}>
          <Trash2 aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="關閉影片" onClick={onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="relative my-auto flex min-h-0 items-center justify-center">
        {url && (
          <video
            src={url}
            controls
            autoPlay
            playsInline
            onPlaying={() => setPlaying(true)}
            onError={() => setError("影片載入失敗，請關閉後重新開啟")}
            className="mx-auto max-h-[calc(100dvh-5rem)] w-full max-w-5xl object-contain"
          />
        )}
        {!playing && !error && (
          <span role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/80">
            <Loader2 className="size-8 animate-spin" aria-hidden="true" />
            <span className="sr-only">影片載入中</span>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mx-auto flex items-center gap-2 pt-2 text-sm text-red-300">
          <AlertCircle className="size-4" aria-hidden="true" />{error}
        </p>
      )}
      <p className="mx-auto w-full max-w-5xl pb-3 pt-2 text-center text-sm text-white/80">{item.userScript}</p>
    </div>
  );
}

export default function VideoGallery({ historyItems, searchQuery, onDelete, onGoCreate }) {
  const [active, setActive] = useState(null);
  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase("zh-TW");
    return term
      ? historyItems.filter((item) =>
          `${item.userScript || ""} ${item.fullPrompt || ""}`.toLocaleLowerCase("zh-TW").includes(term)
        )
      : historyItems;
  }, [historyItems, searchQuery]);

  if (historyItems.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
        <Clapperboard className="size-12 opacity-40" aria-hidden="true" />
        <p className="text-sm font-medium">還沒有生成過的影片</p>
        <Button type="button" size="sm" onClick={onGoCreate}>開始影片創作</Button>
      </div>
    );
  }

  return (
    <div className="pb-24">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((item) => (
          <VideoCard key={item.id} item={item} onOpen={setActive} />
        ))}
      </div>
      {active && (
        <VideoPlayerDialog key={active.id} item={active} onClose={() => setActive(null)} onDelete={onDelete} />
      )}
    </div>
  );
}
