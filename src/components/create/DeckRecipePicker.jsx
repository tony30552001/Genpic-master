import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { DECK_RECIPE_OPTIONS } from "./pptRecipeCopy";

/**
 * 受控的敘事配方選擇器。
 *
 * 配方決定的是「這份簡報要講什麼、依什麼順序講」，與決定外觀的設計風格互不重疊。
 * 選定配方會預填頁數、配圖密度與設計風格，但三者仍可個別調整 —— 配方是建議值，不是鎖。
 */
export default function DeckRecipePicker({ value, onChange, disabled }) {
  return (
    <fieldset disabled={disabled} className="space-y-2 disabled:opacity-60">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <legend className="text-sm font-medium text-foreground">簡報用途</legend>
        <span className="text-xs text-muted-foreground">
          決定章節順序與語調，並預填下方設定
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {DECK_RECIPE_OPTIONS.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
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
