import { useEffect, useRef } from "react";

const DEPTH_KEY = "pixoraLayerDepth";

const currentDepth = () => window.history.state?.[DEPTH_KEY] || 0;

/**
 * Gives a full-screen layer (canvas, mobile result view, sheet) its own browser
 * history entry, so the system back gesture, Esc and the layer's close button
 * all leave the same way. Layers stack: only the topmost one reacts to Esc.
 * Focus moves to `initialFocusRef` on open and returns to the opener on close.
 * Returns `requestClose`, which goes back through that history entry.
 */
export function useHistoryLayer(onClose, initialFocusRef) {
  const onCloseRef = useRef(onClose);
  const focusRef = useRef(initialFocusRef);
  const depthRef = useRef(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // The ref survives StrictMode's effect replay, so the entry is pushed once.
    if (depthRef.current === null) {
      depthRef.current = currentDepth() + 1;
      window.history.pushState({ ...window.history.state, [DEPTH_KEY]: depthRef.current }, "");
    }
    const depth = depthRef.current;
    const returnFocusTo = document.activeElement;
    focusRef.current?.current?.focus();

    const onPopState = () => {
      if (currentDepth() < depth) onCloseRef.current();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented || currentDepth() !== depth) return;
      window.history.back();
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("keydown", onKeyDown);
      if (returnFocusTo instanceof HTMLElement && returnFocusTo.isConnected) returnFocusTo.focus();
    };
  }, []);

  return () => {
    if (currentDepth() === depthRef.current) window.history.back();
    else onCloseRef.current();
  };
}
