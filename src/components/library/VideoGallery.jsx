import React, { useMemo, useState } from "react";
import { Clapperboard } from "@/components/icons/lucideContent";
import { Download, Trash2, X } from "@/components/icons/lucideControls";
import { AlertCircle } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { downloadVideo } from "@/services/aiService";

const downloadUrl = (url, name) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.mp4`;
  link.click();
};

export default function VideoGallery({ historyItems, searchQuery, onDelete, onGoCreate }) {
  const [active, setActive] = useState(null);
  const [loadingId, setLoadingId] = useState("");
  const [error, setError] = useState("");
  const filtered = useMemo(() => {
    const term = searchQuery.trim().toLocaleLowerCase("zh-TW");
    return term
      ? historyItems.filter((item) =>
          `${item.userScript || ""} ${item.fullPrompt || ""}`.toLocaleLowerCase("zh-TW").includes(term)
        )
      : historyItems;
  }, [historyItems, searchQuery]);

  const open = async (item) => {
    setLoadingId(item.id);
    setError("");
    try {
      const blob = await downloadVideo({ jobId: item.videoJobId });
      setActive({ ...item, videoUrl: URL.createObjectURL(blob) });
    } catch (caught) {
      setError(caught.message || "影片載入失敗");
    } finally {
      setLoadingId("");
    }
  };

  const close = () => {
    if (active?.videoUrl) URL.revokeObjectURL(active.videoUrl);
    setActive(null);
  };

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
      {error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4" aria-hidden="true" />{error}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {filtered.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => void open(item)}
            disabled={loadingId === item.id}
            className="group overflow-hidden rounded-2xl border border-border bg-card text-left press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <span className="flex aspect-video items-center justify-center bg-dot-grid bg-size-[18px_18px] text-muted-foreground">
              <Clapperboard className="size-10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none" aria-hidden="true" />
            </span>
            <span className="block p-3">
              <span className="line-clamp-2 text-sm font-medium">{item.userScript || "未命名影片"}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.model}</span>
            </span>
          </button>
        ))}
      </div>

      {active && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3" role="dialog" aria-modal="true" aria-label="影片詳情">
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="下載影片" onClick={() => downloadUrl(active.videoUrl, `pixora-${active.id}`)}>
              <Download aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="刪除影片紀錄" onClick={async () => {
              await onDelete(active.id);
              close();
            }}>
              <Trash2 aria-hidden="true" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="關閉影片" onClick={close}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <video src={active.videoUrl} controls autoPlay playsInline className="mx-auto my-auto max-h-[calc(100dvh-5rem)] w-full max-w-5xl object-contain" />
          <p className="mx-auto w-full max-w-5xl pb-3 pt-2 text-center text-sm text-white/80">{active.userScript}</p>
        </div>
      )}
    </div>
  );
}
