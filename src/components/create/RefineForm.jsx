import React, { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The "修改這張" instruction row; the input is focusable via `[data-refine-input]`. */
export default function RefineForm({ onRefine, isRefining, disabled, refineError }) {
  const inputId = useId();
  const errorId = useId();
  const [instruction, setInstruction] = useState("");
  const canSubmit = Boolean(instruction.trim()) && !disabled;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    if (await onRefine(instruction)) setInstruction("");
  };

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          placeholder="要修改哪裡？例如：把行人的衣服改成黃色"
          aria-label="描述要修改的地方"
          aria-invalid={Boolean(refineError)}
          aria-describedby={refineError ? errorId : undefined}
          data-refine-input
          className="h-10 min-w-0"
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
