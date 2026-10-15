import React, { useId, useRef } from "react";
import * as M from "motion/react-m";
import { ArrowLeft } from "@/components/icons/lucideControls";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";

/**
 * Phone result screen: pushed in from the right like a native detail view and
 * left with the back gesture, Esc or the back button.
 */
export default function MobileResultView({ onClose, children }) {
  const titleId = useId();
  const backButtonRef = useRef(null);
  const requestClose = useHistoryLayer(onClose, backButtonRef);

  return (
    <M.div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%", transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-mobile-result
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-card pl-[max(0.25rem,env(safe-area-inset-left))] pr-4 pt-[env(safe-area-inset-top)]">
        <button
          ref={backButtonRef}
          type="button"
          onClick={requestClose}
          className="flex h-12 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary transition-colors duration-(--motion-hover) active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="icon-md" aria-hidden="true" />
          編輯
        </button>
        <h2 id={titleId} className="flex-1 text-center text-sm font-semibold text-foreground">生成結果</h2>
        <span className="w-16" aria-hidden="true" />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
        {children}
      </div>
    </M.div>
  );
}
