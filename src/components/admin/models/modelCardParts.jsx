import React from "react";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";

export const ROW_GRID = "grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3";

export function CardHead({ id, title, children }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <h2 id={id} className="text-sm font-semibold tracking-tight">{title}</h2>
      {children}
    </div>
  );
}

/** Renders loading or a retryable load error in place of a list's rows. */
export function CardLoadState({ state, retryLabel, children }) {
  if (state.isLoading) {
    return (
      <li className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
        載入中…
      </li>
    );
  }
  if (state.loadError) {
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <p role="alert" className="text-sm text-destructive">{state.loadError}</p>
        <Button type="button" size="xs" variant="outline" onClick={state.load}>{retryLabel}</Button>
      </li>
    );
  }
  return children;
}
