import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_TONES } from "./storyboardActions";

export function StatusPill({ tone, children }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_TONES[tone])}>
      {children}
    </span>
  );
}

export function StoryboardSkeleton({ count = 5, className }) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="storyboard-skeleton h-24 shrink-0 rounded-2xl border border-border" style={{ "--i": index }} />
      ))}
    </div>
  );
}
