import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Version thumbnails: the main line on one row, each branch indented on its own row.
 * With `rail`, the strip becomes a vertical column at `lg` (branches separated by a dashed
 * rule). Renders nothing for a single version.
 */
export default function VersionStrip({ rows, activeVersionId, onSelectVersion, rail = false, className }) {
  const containerRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const ids = rows.flatMap((row) => row.items.map((version) => version.id));
  const hidden = ids.length < 2;
  // Versions present at mount, or while a lone version keeps the strip hidden, are history;
  // only versions added afterwards animate in.
  const [knownIds, setKnownIds] = useState(() => new Set(ids));
  if (hidden && ids.some((id) => !knownIds.has(id))) {
    setKnownIds(new Set([...knownIds, ...ids]));
  }
  const newestAdded = hidden ? undefined : ids.findLast((id) => !knownIds.has(id));

  useEffect(() => {
    if (!newestAdded) return;
    containerRef.current
      ?.querySelector(`[data-version-id="${CSS.escape(newestAdded)}"]`)
      ?.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
  }, [newestAdded, reduceMotion]);

  if (hidden) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        "space-y-1.5",
        rail && "lg:w-[76px] lg:shrink-0 lg:space-y-0 lg:overflow-y-auto lg:border-r lg:border-border lg:bg-card/60 lg:px-2.5 lg:py-3 custom-scrollbar",
        className
      )}
      aria-label="版本"
      role="group"
    >
      {rows.map((row) => (
        <ul
          key={row.items[0].id}
          className={cn(
            "flex items-center gap-1.5 overflow-x-auto pb-0.5",
            row.fromId && "pl-4",
            rail && "lg:flex-col lg:gap-2 lg:overflow-visible lg:pb-2",
            rail && row.fromId && "lg:mt-0.5 lg:border-t lg:border-dashed lg:border-border lg:pl-0 lg:pt-2"
          )}
        >
          {row.fromId && (
            <li className={cn("shrink-0 text-[11px] text-muted-foreground", rail && "lg:text-[10px]")} aria-hidden="true">
              ↳ 分支
            </li>
          )}
          {row.items.map((version) => {
            const isActive = version.id === activeVersionId;
            const description = version.parentId ? version.instruction : "原始";
            return (
              <li
                key={version.id}
                data-version-id={version.id}
                className={cn(
                  "shrink-0",
                  !knownIds.has(version.id) &&
                    "origin-left animate-in fade-in zoom-in-95 duration-(--motion-enter) ease-emphasized motion-reduce:zoom-in-100"
                )}
              >
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  aria-label={description}
                  onClick={() => onSelectVersion(version.id)}
                  className={cn(
                    "w-20 rounded-md border-2 p-0.5 text-left transition-colors duration-(--motion-hover) ease-emphasized active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "border-primary" : "border-transparent hover:border-border",
                    rail && "lg:w-14 lg:rounded-[10px] lg:text-center",
                    rail && isActive && "lg:border-foreground"
                  )}
                >
                  <img src={version.imageUrl} alt="" className={cn("aspect-video w-full rounded object-cover", rail && "lg:rounded-md")} />
                  <span
                    className={cn(
                      "block truncate px-0.5 text-[10px]",
                      isActive ? "font-semibold text-primary" : "text-muted-foreground",
                      rail && "lg:hidden"
                    )}
                  >
                    {description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
