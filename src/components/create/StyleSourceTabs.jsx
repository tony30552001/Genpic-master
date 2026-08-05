import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Palette,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import PromptTemplates from "./PromptTemplates";
import StylePalette from "./StylePalette";
import { STYLE_DIMENSIONS } from "./styleDimensions";

const TABS = [
  { id: "templates", label: "範本" },
  { id: "palette", label: "調色盤" },
  { id: "saved", label: "我的風格" },
];

export default function StyleSourceTabs({
  open = false,
  onOpenChange,
  activeTab = "templates",
  onActiveTabChange,
  selectedPalette = {},
  onPaletteChange,
  onTemplateFill,
  savedStyles = [],
  appliedStyle,
  onApplyStyle,
  onClearAppliedStyle,
  idPrefix = "style-source",
}) {
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleSearch, setStyleSearch] = useState("");

  const selectedPaletteCount = STYLE_DIMENSIONS.reduce(
    (total, dimension) => total + (selectedPalette?.[dimension.id]?.length || 0),
    0
  );

  const filteredStyles = useMemo(() => {
    const query = styleSearch.trim().toLowerCase();
    if (!query) return savedStyles;

    return savedStyles.filter((style) => (
      style.name?.toLowerCase().includes(query)
      || style.description?.toLowerCase().includes(query)
      || style.tags?.some((tag) => tag.toLowerCase().includes(query))
    ));
  }, [savedStyles, styleSearch]);

  const handleTabChange = (tab) => {
    onActiveTabChange?.(tab);
  };

  const handleTemplateFill = (text, palette) => {
    onTemplateFill?.(text, palette);
    onOpenChange?.(true);
    onActiveTabChange?.("templates");
  };

  const handlePaletteChange = (nextSelected) => {
    onPaletteChange?.(nextSelected);
    onOpenChange?.(true);
    onActiveTabChange?.("palette");
  };

  const handleApplyStyle = (style) => {
    onApplyStyle?.(style);
    setShowStylePicker(false);
    onOpenChange?.(true);
    onActiveTabChange?.("saved");
  };

  const headerSummary = appliedStyle?.name
    ? `我的風格：${appliedStyle.name}`
    : selectedPaletteCount > 0
      ? `調色盤已選 ${selectedPaletteCount} 個標籤`
      : "範本、調色盤、我的風格";

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => onOpenChange?.(!open)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-expanded={open}
        aria-controls={`${idPrefix}-content`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-foreground">風格來源</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {headerSummary}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {selectedPaletteCount > 0 && (
            <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">
              {selectedPaletteCount} 個標籤
            </span>
          )}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
      </button>

      <div
        id={`${idPrefix}-content`}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "grid overflow-hidden border-t border-border transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          open
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-3 p-3 sm:p-4">
            <div
              role="tablist"
              aria-label="風格來源類型"
              className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1"
            >
              {TABS.map(({ id, label }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    id={`${idPrefix}-tab-${id}`}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`${idPrefix}-panel-${id}`}
                    onClick={() => handleTabChange(id)}
                    className={cn(
                      "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "bg-background text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {id === "templates" && (
                      <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {id === "palette" && (
                      <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {id === "saved" && (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>

            {activeTab === "templates" && (
              <div
                id={`${idPrefix}-panel-templates`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-tab-templates`}
                tabIndex={0}
              >
                <PromptTemplates collapsible={false} onFill={handleTemplateFill} />
              </div>
            )}

            {activeTab === "palette" && (
              <div
                id={`${idPrefix}-panel-palette`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-tab-palette`}
                tabIndex={0}
              >
                <StylePalette
                  collapsible={false}
                  selected={selectedPalette}
                  onSelectedChange={handlePaletteChange}
                />
              </div>
            )}

            {activeTab === "saved" && (
              <div
                id={`${idPrefix}-panel-saved`}
                role="tabpanel"
                aria-labelledby={`${idPrefix}-tab-saved`}
                tabIndex={0}
                className="space-y-2"
              >
                {appliedStyle?.name ? (
                  <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5">
                    {appliedStyle.previewUrl ? (
                      <img
                        src={appliedStyle.previewUrl}
                        alt=""
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        className="h-9 w-9 shrink-0 rounded-lg border border-primary/20 object-cover"
                      />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-primary">
                        {appliedStyle.name}
                      </span>
                      {appliedStyle.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {appliedStyle.tags.slice(0, 4).map((tag) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="border-primary/15 px-1.5 py-0 text-primary/70"
                            >
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onClearAppliedStyle}
                      className="flex min-h-11 min-w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      title="移除風格"
                      aria-label="移除已套用風格"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowStylePicker((openPicker) => !openPicker)}
                      className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-expanded={showStylePicker}
                      aria-controls={`${idPrefix}-saved-list`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                        從風格庫選擇風格
                        <span className="text-muted-foreground/60">({savedStyles.length})</span>
                      </span>
                      {showStylePicker ? (
                        <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>

                    {showStylePicker && (
                      <div
                        id={`${idPrefix}-saved-list`}
                        className="flex max-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-in fade-in slide-in-from-top-2 duration-200"
                      >
                        <div className="sticky top-0 border-b border-border bg-popover px-3 py-2">
                          <div className="relative">
                            <Search
                              className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <Input
                              type="text"
                              placeholder="搜尋風格…"
                              aria-label="搜尋風格"
                              value={styleSearch}
                              onChange={(e) => setStyleSearch(e.target.value)}
                              className="h-8 w-full rounded-lg py-1.5 pl-8 pr-3 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto py-1">
                          {filteredStyles.length === 0 ? (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                              {savedStyles.length === 0 ? "尚無已儲存的風格" : "找不到符合的風格"}
                            </div>
                          ) : (
                            filteredStyles.map((style) => (
                              <button
                                type="button"
                                key={style.id}
                                onClick={() => handleApplyStyle(style)}
                                className={cn(
                                  "flex min-h-11 w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                  appliedStyle?.id === style.id && "bg-primary/5"
                                )}
                              >
                                {style.previewUrl ? (
                                  <img
                                    src={style.previewUrl}
                                    alt=""
                                    width={40}
                                    height={40}
                                    loading="lazy"
                                    decoding="async"
                                    className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                  />
                                ) : (
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <Palette className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
                                  </span>
                                )}

                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5">
                                    <span className="truncate text-xs font-medium text-foreground">
                                      {style.name}
                                    </span>
                                    {style.visibility === "shared" && (
                                      <Badge
                                        variant="outline"
                                        className="border-primary/15 px-1.5 py-0 text-[10px] text-primary"
                                      >
                                        共享
                                      </Badge>
                                    )}
                                    {appliedStyle?.id === style.id && (
                                      <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                                    )}
                                  </span>
                                  {style.description && (
                                    <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">
                                      {style.description}
                                    </span>
                                  )}
                                  {style.tags?.length > 0 && (
                                    <span className="mt-1 flex flex-wrap gap-1">
                                      {style.tags.slice(0, 3).map((tag) => (
                                        <Badge
                                          key={tag}
                                          variant="secondary"
                                          className="bg-muted px-1.5 py-0 text-muted-foreground hover:bg-muted"
                                        >
                                          #{tag}
                                        </Badge>
                                      ))}
                                    </span>
                                  )}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
