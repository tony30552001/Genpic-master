import { useEffect, useState } from "react";
import { CloudCheck, Loader2 } from "lucide-react";

import DeckTimeline from "./DeckTimeline";

const formatElapsed = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * 簡報生成的階段式進度。工作跑在伺服器上，所以這裡同時告訴使用者
 * 「可以安心離開這個頁面」，避免長時間等待造成的焦慮與誤操作。
 *
 * 有事件之後，步驟名稱由時間軸負責，標題不再重複同一句話；
 * `phase` 只用來說明建立工作之前的本機階段（準備、上傳文件）。
 */
export default function DeckProgress({ phase, current, total, startedAt, events }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const percent =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const elapsed =
    startedMs && Number.isFinite(startedMs) ? formatElapsed(now - startedMs) : null;

  return (
    <div
      className="space-y-3 rounded-lg border border-border bg-muted/40 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {events?.length > 0 ? "AI 正在設計你的簡報" : phase || "準備中"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 pl-6 text-xs tabular-nums text-muted-foreground sm:ml-auto sm:pl-0">
          {elapsed && <span>已耗時 {elapsed}</span>}
          {total > 0 && (
            <span>
              {current}/{total} 頁
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <DeckTimeline events={events} />
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <CloudCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          每一頁都由 AI 逐頁設計並通過版面品質檢查，整份簡報約需 5–15 分鐘。
          生成在雲端進行，你可以切換頁籤、重新整理或關閉瀏覽器，回到這裡會自動接續進度。
        </span>
      </p>
    </div>
  );
}
