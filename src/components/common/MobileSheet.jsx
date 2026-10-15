import React, { useId, useRef } from "react";
import * as M from "motion/react-m";
import { X } from "@/components/icons/lucideControls";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";

/**
 * Phone bottom sheet. Render it inside `AnimatePresence`; back, Esc, the scrim
 * and the close button all dismiss it through its history entry. `footer` is a
 * render function that receives the same close action.
 */
export default function MobileSheet({ title, onClose, children, footer }) {
  const titleId = useId();
  const closeButtonRef = useRef(null);
  const requestClose = useHistoryLayer(onClose, closeButtonRef);

  return (
    <M.div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-mobile-sheet
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={requestClose}
        aria-label={`關閉${title}`}
      />
      <M.div
        className="relative z-10 flex max-h-[85dvh] flex-col rounded-t-2xl bg-card text-card-foreground shadow-2xl"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%", transition: OVERLAY_EXIT }}
        transition={OVERLAY_ENTER}
      >
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
        <div className="flex shrink-0 items-center justify-between px-4 pb-1 pt-1">
          <h2 id={titleId} className="text-base font-semibold text-foreground">{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors duration-(--motion-hover) hover:bg-muted active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`關閉${title}`}
          >
            <X className="icon-md" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer(requestClose)}
          </div>
        )}
        {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" aria-hidden="true" />}
      </M.div>
    </M.div>
  );
}
