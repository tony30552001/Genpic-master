import React from "react";
import { Check, Loader2 } from "@/components/icons/lucideStatus";
import Reasoning from "@/components/chat/Reasoning";
import { cn } from "@/lib/utils";
import { STORYBOARD_STEP_LABELS, shotCountLabel } from "./progressSteps";

/** Live state of an agent job in the conversation: its steps, scene count, and reasoning summary. */
export default function StoryboardProgress({ progress, waitingLabel }) {
  if (!progress) {
    return (
      <p className="storyboard-enter flex items-center gap-2 text-xs text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
        {waitingLabel}
      </p>
    );
  }
  const current = progress.steps.indexOf(progress.step);
  const count = shotCountLabel(progress);
  return (
    <div className="storyboard-enter flex flex-col gap-2.5 rounded-2xl border border-border bg-card px-3.5 py-3">
      <p className="sr-only" role="status">
        {STORYBOARD_STEP_LABELS[progress.step]}{progress.step === "writing" && count ? `，已完成 ${count}` : ""}
      </p>
      <ol className="flex flex-col gap-1.5" aria-label="分鏡進度">
        {progress.steps.map((step, index) => {
          const state = index < current ? "done" : index === current ? "running" : "pending";
          return (
            <li
              key={step}
              className={cn(
                "flex min-w-0 items-center gap-2 text-xs transition-colors duration-200",
                state === "pending" ? "text-muted-foreground/60" : state === "running" ? "font-medium text-foreground" : "text-muted-foreground"
              )}
              aria-current={state === "running" ? "step" : undefined}
            >
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
                {state === "done" ? (
                  <Check className="size-3.5 text-primary animate-in fade-in zoom-in-90 duration-(--motion-enter) ease-emphasized motion-reduce:zoom-in-100" />
                ) : state === "running" ? (
                  <Loader2 className="size-3.5 animate-spin text-primary motion-reduce:animate-none" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              <span className="truncate">{STORYBOARD_STEP_LABELS[step]}</span>
              {step === "writing" && count && state !== "pending" && (
                <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">已完成 {count}</span>
              )}
            </li>
          );
        })}
      </ol>
      {progress.reasoning && (
        <div className="border-t border-border pt-2">
          <Reasoning text={progress.reasoning} isThinking label="思考過程" />
        </div>
      )}
    </div>
  );
}
