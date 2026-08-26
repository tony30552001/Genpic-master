import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { IMAGE_DENSITY_OPTIONS } from "./pptTemplateCopy";

/**
 * 受控的配圖密度選擇器。
 *
 * 密度只決定「要配幾張圖」，實際挑哪幾頁由後端的決定性政策裁定，
 * 因此這裡不提供逐頁開關。
 */
export default function DeckImageDensityPicker({ value, onChange, disabled }) {
  return (
    <fieldset disabled={disabled} className="space-y-2 disabled:opacity-60">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <legend className="text-sm font-medium text-foreground">AI 配圖</legend>
        <span className="text-xs text-muted-foreground">
          決定整份簡報要產生幾張配圖
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {IMAGE_DENSITY_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left touch-manipulation transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span className="min-w-0 truncate text-sm font-medium">{option.name}</span>
                {selected && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
