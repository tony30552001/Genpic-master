import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * 設定流程的單一步驟。編號與可收合的摘要讓長表單維持可掃視的動線：
 * 收合時仍看得到這一步做了什麼決定，不必展開核對。
 */
export default function DeckSetupSection({
  step,
  title,
  hint,
  summary,
  complete = false,
  open,
  onToggle,
  children,
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full min-w-0 items-center gap-3 px-3 py-3 text-left touch-manipulation transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors",
              complete
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground"
            )}
            aria-hidden="true"
          >
            {complete ? <Check className="h-3.5 w-3.5" /> : step}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-foreground">{title}</span>
              {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
            </span>
            {!open && summary && (
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{summary}</span>
            )}
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {open ? "收合" : "展開"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180"
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      {open && (
        <div className="space-y-4 border-t border-border p-3 sm:p-4">{children}</div>
      )}
    </section>
  );
}
