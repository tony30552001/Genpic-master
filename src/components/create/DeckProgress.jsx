import { Loader2 } from "lucide-react";

/**
 * 簡報生成的階段式進度：解析素材 → 規劃大綱 → 逐頁設計 → 品質檢查 → 匯出。
 */
export default function DeckProgress({ phase, current, total }) {
  const percent =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  return (
    <div
      className="space-y-2 rounded-lg border border-border bg-muted/40 p-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {phase || "準備中"}
        </span>
        {total > 0 && (
          <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
            {current}/{total}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        每一頁都由 AI 逐頁設計並通過版面品質檢查，整份簡報約需 5–15 分鐘。
      </p>
    </div>
  );
}
