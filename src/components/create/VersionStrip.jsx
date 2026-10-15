import React from "react";
import { cn } from "@/lib/utils";

/** Version thumbnails: the main line on one row, each branch indented on its own row. */
export default function VersionStrip({ rows, activeVersionId, onSelectVersion, getVersionLabel, getVersion }) {
  return (
    <div className="space-y-1.5" aria-label="版本" role="group">
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
              <li key={version.id} className="shrink-0">
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
