import { Brain } from "@/components/icons/lucideContent";
import { ChevronDown } from "@/components/icons/lucideControls";
import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

/** The model's reasoning summary: a shimmer while it thinks, then a collapsible block. */
export default function Reasoning({ text, isThinking, label: title = isThinking ? "思考中…" : "已思考" }) {
  const label = <span className="truncate">{isThinking ? <Shimmer>{title}</Shimmer> : title}</span>;

  if (!text) {
    return isThinking ? (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        {label}
      </div>
    ) : null;
  }

  return (
    <details className="group/reasoning text-xs text-muted-foreground">
      <summary className="flex min-w-0 cursor-pointer list-none items-center gap-1.5 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Brain className="size-3.5 shrink-0" aria-hidden="true" />
        {label}
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-150 group-open/reasoning:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      <div className="mt-1.5 border-l border-border pl-3">
        <MessageResponse className="text-xs leading-relaxed" isAnimating={isThinking}>
          {text}
        </MessageResponse>
      </div>
    </details>
  );
}
