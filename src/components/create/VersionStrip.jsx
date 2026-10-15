import React, { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/** Version thumbnails: the main line on one row, each branch indented on its own row. Renders nothing for a single version. */
export default function VersionStrip({ rows, activeVersionId, onSelectVersion, getVersionLabel, getVersion }) {
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
    <div ref={containerRef} className="space-y-1.5" aria-label="版本" role="group">
      {rows.map((row) => (
        <ul
          key={row.items[0].id}
          className={cn("flex items-center gap-1.5 overflow-x-auto pb-0.5", row.fromId && "pl-4")}
        >
          {row.fromId && (
            <li className="shrink-0 text-[11px] text-muted-foreground" aria-hidden="true">
              ↳ 從 {getVersionLabel(getVersion(row.fromId))}
            </li>
          )}
          {row.items.map((version) => {
            const label = getVersionLabel(version);
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
                  aria-label={`${label}：${description}`}
                  onClick={() => onSelectVersion(version.id)}
                  className={cn(
                    "w-20 rounded-md border-2 p-0.5 text-left transition-colors duration-(--motion-hover) ease-emphasized active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isActive ? "border-primary" : "border-transparent hover:border-border"
                  )}
                >
                  <img src={version.imageUrl} alt="" className="aspect-video w-full rounded object-cover" />
                  <span
                    className={cn(
                      "block truncate px-0.5 text-[10px]",
                      isActive ? "font-semibold text-primary" : "text-muted-foreground"
                    )}
                  >
                    {label} {description}
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
