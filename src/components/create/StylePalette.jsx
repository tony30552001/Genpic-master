import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STYLE_DIMENSIONS } from "./styleDimensions";

/**
 * StylePalette — 8 維度風格屬性調色盤（受控元件）
 * selected: { dimensionId: string[] }  由父元件管理
 * onSelectedChange(newSelected): 通知父元件更新
 */
export default function StylePalette({
  selected = {},
  onSelectedChange,
  collapsible = true,
  defaultCollapsed = true,
  dimensions = STYLE_DIMENSIONS,
  selectionMode = "multiple",
  showClear = true,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const activeCount = useMemo(
    () => dimensions.reduce((sum, d) => sum + (selected[d.id]?.length ?? 0), 0),
    [dimensions, selected]
  );

  const toggleTag = useCallback(
    (dimensionId, tag) => {
      const dimTags = Array.isArray(selected[dimensionId])
        ? selected[dimensionId]
        : selected[dimensionId]
          ? [selected[dimensionId]]
          : [];
      const isActive = dimTags.includes(tag);
      const nextTags = isActive
        ? dimTags.filter((t) => t !== tag)
        : selectionMode === "single"
          ? [tag]
          : [...dimTags, tag];
      const next = { ...selected };
      if (nextTags.length > 0) {
        next[dimensionId] = nextTags;
      } else {
        delete next[dimensionId];
      }
      onSelectedChange?.(next);
    },
    [onSelectedChange, selected, selectionMode]
  );

  const handleClear = useCallback(() => {
    onSelectedChange?.({});
  }, [onSelectedChange]);

  const paletteContent = (
    <CardContent className="space-y-4 border-t border-border bg-background/80 p-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
        {dimensions.map(({ id, label, tags }) => (
          <div key={id} className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <div
              className="flex flex-wrap gap-1.5"
              role={selectionMode === "single" ? "radiogroup" : "group"}
              aria-label={label}
            >
              {tags.map((tag) => {
                const selectedTags = Array.isArray(selected[id])
                  ? selected[id]
                  : selected[id]
                    ? [selected[id]]
                    : [];
                const isActive = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(id, tag)}
                    role={selectionMode === "single" ? "radio" : undefined}
                    aria-checked={selectionMode === "single" ? isActive : undefined}
                    aria-pressed={selectionMode === "multiple" ? isActive : undefined}
                    className={cn(
                      "min-h-11 touch-manipulation rounded-full border px-3 py-2 text-sm leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      isActive
                        ? "border-primary/60 bg-primary/10 text-primary hover:border-primary/70 hover:bg-primary/15"
                        : "border-border bg-background text-foreground/70 hover:border-border/70 hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showClear && (
        <div className="border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={handleClear}
            className="min-h-11 touch-manipulation rounded-lg border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            清空風格
          </button>
        </div>
      )}
    </CardContent>
  );

  if (!collapsible) {
    return paletteContent;
  }

  return (
    <Card className="rounded-2xl border-border bg-card">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={!collapsed}
      >
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-semibold text-foreground">風格調色盤</span>
          <span className="block truncate text-xs text-muted-foreground">
            選擇畫風、情緒、光線等維度，精確引導生圖風格。
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {activeCount > 0 && (
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 px-2 py-0 text-primary"
            >
              已套用 {activeCount}
            </Badge>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
      </button>

      <div
        aria-hidden={collapsed}
        inert={collapsed}
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          collapsed
            ? "pointer-events-none grid-rows-[0fr] opacity-0"
            : "grid-rows-[1fr] opacity-100"
        )}
      >
        <div className="min-h-0 overflow-hidden">{paletteContent}</div>
      </div>
    </Card>
  );
}
