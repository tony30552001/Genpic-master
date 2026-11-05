import React, { useId, useState } from "react";
import { ArrowUp } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

/**
 * The refine bar under the canvas; the field grows with its text and is focusable via
 * `[data-refine-input]`. Enter submits and Shift+Enter breaks the line; touch keyboards
 * break the line on Enter.
 */
export default function RefineForm({ onRefine, isRefining, disabled, refineError, className }) {
  const errorId = useId();
  const [instruction, setInstruction] = useState("");
  const isTouch = useMediaQuery("(pointer: coarse)");
  const canSubmit = Boolean(instruction.trim()) && !disabled;
  const submitLabel = isRefining ? "修改中…" : "修改這張";

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await onRefine(instruction)) setInstruction("");
  };

  return (
    <form onSubmit={submit} className={cn("space-y-1.5", className)}>
      <div
        className={cn(
          "flex items-end gap-2 rounded-[20px] border border-border bg-card py-2 pl-4 pr-2 shadow-sm transition-colors duration-(--motion-hover) focus-within:border-ring/60",
          refineError && "border-destructive/60"
        )}
      >
        <textarea
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || isTouch || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (canSubmit) event.currentTarget.form?.requestSubmit();
          }}
          rows={1}
          placeholder="要修改哪裡？例如：衣服改成黃色"
          aria-label="描述要修改的地方"
          aria-invalid={Boolean(refineError)}
          aria-describedby={refineError ? errorId : undefined}
          data-refine-input
          className="field-sizing-content block max-h-[154px] min-h-8 min-w-0 flex-1 resize-none bg-transparent py-1 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label={submitLabel}
          title={submitLabel}
          className="grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-30"
        >
          {isRefining ? (
            <Loader2 className="icon-sm animate-spin" aria-hidden="true" />
          ) : (
            <ArrowUp className="icon-sm" aria-hidden="true" />
          )}
        </button>
      </div>
      {refineError && (
        <p id={errorId} role="alert" className="px-2 text-xs text-destructive">
          {refineError}
        </p>
      )}
    </form>
  );
}
