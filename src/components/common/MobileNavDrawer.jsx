import { useRef } from "react";
import * as M from "motion/react-m";
import { X } from "@/components/icons/lucideControls";
import { ShieldCheck } from "@/components/icons/lucideContent";
import PixoraWordmark from "@/components/icons/PixoraWordmark";
import { useHistoryLayer } from "@/hooks/useHistoryLayer";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import { cn } from "@/lib/utils";

const ITEM_CLASS =
  "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Phone navigation drawer. Render it inside `AnimatePresence`; back, Esc, the
 * scrim and the close button dismiss it through its history entry.
 */
export default function MobileNavDrawer({ tabs, activeTab, onTabChange, isAdmin, onOpenAdmin, onClose }) {
  const closeButtonRef = useRef(null);
  const pendingActionRef = useRef(null);
  // Run the chosen action after the history entry is popped, so a navigation
  // (管理中心) is not undone by the drawer's own history.back().
  const requestClose = useHistoryLayer(() => {
    onClose();
    pendingActionRef.current?.();
  }, closeButtonRef);
  const select = (action) => {
    pendingActionRef.current = action;
    requestClose();
  };

  return (
    <M.div
      className="fixed inset-0 z-50 lg:hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: OVERLAY_EXIT }}
      transition={OVERLAY_ENTER}
      role="dialog"
      aria-modal="true"
      aria-label="主要功能"
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={requestClose}
        aria-label="關閉選單"
      />
      <M.nav
        aria-label="主要功能"
        className="absolute inset-y-0 left-0 flex w-[min(80vw,18rem)] flex-col bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] shadow-2xl"
        initial={{ x: "-100%" }}
        animate={{ x: 0 }}
        exit={{ x: "-100%", transition: OVERLAY_EXIT }}
        transition={OVERLAY_ENTER}
      >
        <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2">
          <PixoraWordmark />
          <button
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            className="flex size-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="關閉選單"
          >
            <X className="icon-md" aria-hidden="true" />
          </button>
        </div>
        <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2 py-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  onClick={() => select(() => onTabChange(tab.id))}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    ITEM_CLASS,
                    isActive ? "bg-muted font-semibold text-foreground" : "text-muted-foreground active:bg-muted"
                  )}
                >
                  <tab.icon className="icon-md" aria-hidden="true" />
                  {tab.label}
                </button>
              </li>
            );
          })}
        </ul>
        {isAdmin && (
          <div className="shrink-0 px-2 py-2">
            <button type="button" onClick={() => select(onOpenAdmin)} className={cn(ITEM_CLASS, "text-muted-foreground active:bg-muted")}>
              <ShieldCheck className="icon-md" aria-hidden="true" />
              管理中心
            </button>
          </div>
        )}
      </M.nav>
    </M.div>
  );
}
