import React, { useState } from "react";
import { History } from "@/components/icons/lucideContent";
import { Trash2 } from "@/components/icons/lucideControls";
import { AlertCircle } from "@/components/icons/lucideStatus";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Saved video creations (useVideoSessions); each row reopens one in the video workspace. */
export default function VideoSessionList({ sessions, onOpen }) {
  const [deleting, setDeleting] = useState(null);
  if (sessions.items.length === 0 && !sessions.error) return null;

  return (
    <section className="mb-6" aria-labelledby="video-sessions-heading">
      <h2 id="video-sessions-heading" className="mb-2 text-sm font-semibold">創作紀錄</h2>
      {sessions.error && (
        <p role="alert" className="mb-2 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />{sessions.error}
        </p>
      )}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {sessions.items.map((item) => (
          <li key={item.id} className="flex items-center gap-1 pr-2">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onClick={() => onOpen(item.id)}
              aria-label={`繼續創作：${item.title || "未命名創作"}`}
            >
              <History className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{item.title || "未命名創作"}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {dateFormatter.format(new Date(item.updatedAt))}
              </span>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={`刪除創作紀錄：${item.title || "未命名創作"}`}
              onClick={() => setDeleting(item)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>
      {sessions.hasMore && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full text-xs text-muted-foreground"
          disabled={sessions.isLoading}
          onClick={() => void sessions.loadMore()}
        >
          {sessions.isLoading ? "載入中…" : "載入更多"}
        </Button>
      )}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>刪除這段創作？</AlertDialogTitle>
            <AlertDialogDescription>
              分鏡與對話紀錄會永久刪除；已生成的影片仍保留在素材中心。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void sessions.remove(deleting.id)}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
