import { ChevronDown, Settings2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 生成中與生成後，輸入欄位都是唯讀的死重量，卻會把進度卡推到摺線以下。
 * 這裡把設定收合成一行摘要，讓進度成為視線焦點，需要時仍可展開核對。
 */
export default function DeckSetupSummary({ title, meta, expanded, onToggle, children }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/40">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex w-full min-w-0 items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-foreground">{title}</span>
            {meta && (
              <span className="block truncate text-xs text-muted-foreground">{meta}</span>
            )}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {expanded ? "收合設定" : "查看設定"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      {expanded && children}
    </div>
  );
}
