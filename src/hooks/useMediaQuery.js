import { useCallback, useSyncExternalStore } from "react";

/** Subscribes to a CSS media query; use it only where layout must change structure, not style. */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/** Below Tailwind's `lg`: the phone layout with bottom navigation. The web layout starts at 1024px. */
export const MOBILE_LAYOUT_QUERY = "(max-width: 1023.98px)";
