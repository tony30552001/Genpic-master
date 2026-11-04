import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * The "修改這張" instruction row; the field is focusable via `[data-refine-input]`.
 * Enter submits and Shift+Enter breaks the line; touch keyboards break the line on Enter.
 */
export default function RefineForm({ onRefine, isRefining, disabled, refineError }) {
  const inputId = useId();
  const errorId = useId();
  const [instruction, setInstruction] = useState("");
  const isTouch = useMediaQuery("(pointer: coarse)");
  const canSubmit = Boolean(instruction.trim()) && !disabled;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await onRefine(instruction)) setInstruction("");
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex items-end gap-2">
        <Textarea
          id={inputId}
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
          className="field-sizing-content max-h-32 min-h-10 min-w-0 resize-none py-2"
        />
        <Button type="submit" disabled={!canSubmit} className="h-10 shrink-0 font-semibold">
          {isRefining ? "修改中…" : "修改這張"}
        </Button>
      </div>
      {refineError && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {refineError}
        </p>
      )}
    </form>
  );
}
