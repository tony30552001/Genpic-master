import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Loader2,
  MinusCircle,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { buildTimeline } from "./deckSteps";

const STATUS_ICON = {
  running: { Icon: Loader2, className: "animate-spin text-primary" },
  succeeded: { Icon: Check, className: "text-primary" },
  failed: { Icon: X, className: "text-destructive" },
  skipped: { Icon: MinusCircle, className: "text-muted-foreground" },
  pending: { Icon: Circle, className: "text-muted-foreground/50" },
};

function StatusIcon({ status, className }) {
  const { Icon, className: statusClass } = STATUS_ICON[status] || STATUS_ICON.pending;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", statusClass, className)} aria-hidden="true" />;
}

function StepItems({ items }) {
  return (
    <ul className="mt-1 space-y-1 border-l border-border pl-4">
      {items.map((item) => (
        <li key={item.slideNumber} className="flex min-w-0 items-center gap-1.5">
          {item.status === "failed" ? (
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <StatusIcon status={item.status} className="h-3 w-3" />
          )}
          <span
            className={cn(
              "min-w-0 truncate text-xs",
              item.status === "failed" ? "text-warning" : "text-muted-foreground"
            )}
          >
            {item.detail || `第 ${item.slideNumber} 頁`}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 逐步展開的生成歷程。等待 5–15 分鐘時，「現在做到第幾頁、上一頁過了沒」
 * 比單一百分比更能說明進度，失敗時也能直接看出斷在哪一步。
 */
export default function DeckTimeline({ events }) {
  const [overrides, setOverrides] = useState({});
  const steps = buildTimeline(events);

  const toggle = (stepId, isOpen) =>
    setOverrides((current) => ({ ...current, [stepId]: !isOpen }));

  return (
    <ol className="space-y-1.5">
      {steps.map((step) => {
        const hasItems = step.items.length > 0;
        const isOpen = overrides[step.id] ?? step.status === "running";
        const isMuted = step.status === "pending" || step.status === "skipped";

        return (
          <li key={step.id} className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <StatusIcon status={step.status} />
              <span
                className={cn(
                  "shrink-0 text-xs font-medium",
                  isMuted ? "text-muted-foreground" : "text-foreground"
                )}
              >
                {step.label}
              </span>
              {step.detail && (
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {step.detail}
                </span>
              )}
              {hasItems && (
                <button
                  type="button"
                  onClick={() => toggle(step.id, isOpen)}
                  aria-expanded={isOpen}
                  className="ml-auto flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {step.items.length} 項
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            {hasItems && isOpen && <StepItems items={step.items} />}
          </li>
        );
      })}
    </ol>
  );
}
