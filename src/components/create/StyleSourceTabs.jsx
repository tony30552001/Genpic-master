import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Library,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import StylePalette from "./StylePalette";
import StylePresetPicker from "./StylePresetPicker";
import TaskTemplatePicker from "./TaskTemplatePicker";
import { STYLE_DIMENSIONS } from "./styleDimensions";
import {
  CORE_STYLE_DIMENSIONS,
  MORE_STYLE_DIMENSIONS,
  STYLE_PRESETS,
  STYLE_SOURCE_CONTEXT_VERSION,
  paletteToSelection,
  tagsToSelection,
} from "./styleSourceData";

const STYLE_TABS = [
  { id: "presets", label: "風格預設" },
  { id: "saved", label: "我的風格" },
];

const emptyContext = {
  version: STYLE_SOURCE_CONTEXT_VERSION,
};

const normalizeSelection = (selection = {}) =>
  Object.fromEntries(
    Object.entries(selection).flatMap(([dimensionId, values]) => {
      const normalized = Array.isArray(values)
        ? values.filter(Boolean).slice(-1)
        : values
          ? [values]
          : [];
      return normalized.length > 0 ? [[dimensionId, normalized]] : [];
    })
  );

function SelectionChips({ selected, onRemove, onClear }) {
  const chips = STYLE_DIMENSIONS.flatMap((dimension) =>
    (selected[dimension.id] || []).map((value) => ({
      dimensionId: dimension.id,
      label: dimension.label,
      value,
    }))
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-foreground">已選細節</p>
        {chips.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            清除全部
          </button>
        )}
      </div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map(({ dimensionId, label, value }) => (
            <span
              key={`${dimensionId}-${value}`}
              className="inline-flex min-h-9 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 pl-3 pr-1.5 text-xs font-medium text-primary"
            >
              {label}：{value}
              <button
                type="button"
                onClick={() => onRemove(dimensionId)}
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`移除${label}${value}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/25 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          先選一組風格預設，或直接微調下方的核心維度。
        </p>
      )}
    </div>
  );
}

function SavedStylePanel({
  savedStyles,
  appliedStyle,
  onApply,
  onClear,
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [search, setSearch] = useState("");

  const filteredStyles = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return savedStyles;

    return savedStyles.filter((style) =>
      [style.name, style.description, ...(style.tags || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [savedStyles, search]);

  if (appliedStyle?.name) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 p-3">
          {appliedStyle.previewUrl ? (
            <img
              src={appliedStyle.previewUrl}
              alt=""
              width={56}
              height={56}
              loading="lazy"
              decoding="async"
              className="h-14 w-14 shrink-0 rounded-xl border border-primary/20 object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Palette className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-primary">
              {appliedStyle.name}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              已套用此風格的品牌視覺與描述。
            </p>
            {appliedStyle.tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {appliedStyle.tags.slice(0, 5).map((tag) => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="border-primary/15 bg-background px-1.5 py-0 text-primary/80"
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClear}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="移除已套用風格"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="rounded-xl border border-dashed border-border bg-muted/25 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          我的風格只改變品牌視覺，不會改寫你的主題或輸出類型。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowPicker((open) => !open)}
        className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={showPicker}
        aria-controls="saved-style-list"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Library className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">從風格庫選擇風格</span>
          <span className="shrink-0 text-muted-foreground/60">({savedStyles.length})</span>
        </span>
        {showPicker ? (
          <ChevronUp className="h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
      </button>

      {showPicker && (
        <div
          id="saved-style-list"
          className="flex max-h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-popover shadow-lg"
        >
          <div className="border-b border-border bg-popover p-3">
            <div className="relative">
              <Search
                className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                placeholder="搜尋風格…"
                aria-label="搜尋我的風格"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 rounded-lg pl-9 text-xs"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {filteredStyles.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                {savedStyles.length === 0 ? "尚無已儲存的風格" : "找不到符合的風格"}
              </p>
            ) : (
              <div className="space-y-1" role="radiogroup" aria-label="我的風格">
                {filteredStyles.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    role="radio"
                    aria-checked={appliedStyle?.id === style.id}
                    onClick={() => onApply(style)}
                    className={cn(
                      "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      appliedStyle?.id === style.id && "bg-primary/5"
                    )}
                  >
                    {style.previewUrl ? (
                      <img
                        src={style.previewUrl}
                        alt=""
                        width={44}
                        height={44}
                        loading="lazy"
                        decoding="async"
                        className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Palette className="h-4 w-4 text-muted-foreground/50" aria-hidden="true" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-foreground">
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
                      </span>
                      {style.description && (
                        <span className="mt-1 block line-clamp-1 text-xs text-muted-foreground">
                          {style.description}
                        </span>
                      )}
                      {style.tags?.length > 0 && (
                        <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                          {style.tags.slice(0, 4).map((tag) => `#${tag}`).join(" ")}
                        </span>
                      )}
                    </span>
                    {appliedStyle?.id === style.id && (
                      <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StyleSourceTabs({
  open = false,
  onOpenChange,
  activeTab = "presets",
  onActiveTabChange,
  templateContext = emptyContext,
  onTemplateChange,
  selectedPalette = {},
  onPaletteChange,
  selectedPresetId = null,
  onPresetChange,
  savedStyles = [],
  appliedStyle,
  onApplyStyle,
  onClearAppliedStyle,
  idPrefix = "style-source",
}) {
  const [showMoreDimensions, setShowMoreDimensions] = useState(false);
  const navigate = useNavigate();

  const selectedPaletteCount = STYLE_DIMENSIONS.reduce(
    (total, dimension) => total + (selectedPalette?.[dimension.id]?.length || 0),
    0
  );
  const selectedPreset = STYLE_PRESETS.find((preset) => preset.id === selectedPresetId);
  const selectedStyleName =
    appliedStyle?.name ||
    selectedPreset?.title ||
    (selectedPaletteCount > 0 ? "自訂視覺微調" : "尚未選擇風格");
  const normalizedSelection = normalizeSelection(selectedPalette);

  const updatePalette = (nextSelection) => {
    onPaletteChange?.(normalizeSelection(nextSelection));
  };

  const handlePresetSelect = (preset) => {
    if (appliedStyle?.id) onClearAppliedStyle?.();
    onPresetChange?.(preset);
    updatePalette(paletteToSelection(preset.palette));
    onActiveTabChange?.("presets");
  };

  const handlePaletteChange = (nextSelection) => {
    if (appliedStyle?.id) onClearAppliedStyle?.();
    onPresetChange?.(null);
    updatePalette(nextSelection);
    onActiveTabChange?.("presets");
  };

  const handleApplyStyle = (style) => {
    onPresetChange?.(null);
    updatePalette(tagsToSelection(style.tags));
    onApplyStyle?.(style);
    onActiveTabChange?.("saved");
  };

  const handleClearAppliedStyle = () => {
    onClearAppliedStyle?.();
    onPresetChange?.(null);
    updatePalette({});
  };

  const handleRemoveDimension = (dimensionId) => {
    const nextSelection = { ...normalizedSelection };
    delete nextSelection[dimensionId];
    handlePaletteChange(nextSelection);
  };

  const handleTabKeyDown = (event, tabId) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = STYLE_TABS.findIndex((tab) => tab.id === tabId);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? STYLE_TABS.length - 1
          : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + STYLE_TABS.length) %
            STYLE_TABS.length;
    const nextTab = STYLE_TABS[nextIndex].id;
    onActiveTabChange?.(nextTab);
    document.getElementById(`${idPrefix}-tab-${nextTab}`)?.focus();
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card" aria-labelledby={`${idPrefix}-title`}>
      <button
        type="button"
        onClick={() => onOpenChange?.(!open)}
        className="sticky top-0 z-20 flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 border-b border-transparent bg-card/95 px-4 py-3 text-left backdrop-blur-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-expanded={open}
        aria-controls={`${idPrefix}-content`}
      >
        <span className="min-w-0">
          <span id={`${idPrefix}-title`} className="block text-sm font-semibold text-foreground">
            參考與風格
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {templateContext?.title
              ? `${templateContext.title} · ${selectedStyleName}`
              : selectedStyleName}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {selectedPaletteCount > 0 && (
            <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary sm:text-xs">
              {selectedPaletteCount} 個細節
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
          <div className="space-y-7 p-4 sm:p-5">
            <TaskTemplatePicker
              context={templateContext}
              onChange={onTemplateChange}
            />

            <section className="space-y-4 border-t border-border pt-6" aria-labelledby={`${idPrefix}-visual-title`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5">
                      02
                    </span>
                    視覺風格
                  </p>
                  <h3 id={`${idPrefix}-visual-title`} className="text-base font-semibold text-foreground">
                    選一組方向，再決定細節
                  </h3>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    先用視覺預設快速選擇，避免一開始面對大量專有名詞。
                  </p>
                </div>
                <span className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  每個維度單選
                </span>
              </div>

              <div
                role="tablist"
                aria-label="視覺風格來源"
                className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
              >
                {STYLE_TABS.map(({ id, label }) => {
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      id={`${idPrefix}-tab-${id}`}
                      type="button"
                      role="tab"
                      tabIndex={isActive ? 0 : -1}
                      aria-selected={isActive}
                      aria-controls={`${idPrefix}-panel-${id}`}
                      onClick={() => onActiveTabChange?.(id)}
                      onKeyDown={(event) => handleTabKeyDown(event, id)}
                      className={cn(
                        "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "bg-background text-primary shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {id === "presets" ? (
                        <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Library className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>

              {activeTab === "presets" && (
                <div
                  id={`${idPrefix}-panel-presets`}
                  role="tabpanel"
                  aria-labelledby={`${idPrefix}-tab-presets`}
                  tabIndex={0}
                  className="space-y-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <StylePresetPicker
                    selectedPresetId={selectedPresetId}
                    onSelect={handlePresetSelect}
                  />

                  <div className="space-y-3 rounded-2xl border border-border bg-background p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">核心維度</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          每個維度選一項，保留清楚的視覺方向。
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {selectedPaletteCount} 項
                      </span>
                    </div>
                    <StylePalette
                      collapsible={false}
                      selected={normalizedSelection}
                      onSelectedChange={handlePaletteChange}
                      dimensions={CORE_STYLE_DIMENSIONS}
                      selectionMode="single"
                      showClear={false}
                    />
                    <button
                      type="button"
                      onClick={() => setShowMoreDimensions((openMore) => !openMore)}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-expanded={showMoreDimensions}
                      aria-controls={`${idPrefix}-more-dimensions`}
                    >
                      {showMoreDimensions ? "收起更多維度" : "微調更多維度"}
                      {showMoreDimensions ? (
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                    {showMoreDimensions && (
                      <div id={`${idPrefix}-more-dimensions`} className="border-t border-border pt-3">
                        <StylePalette
                          collapsible={false}
                          selected={normalizedSelection}
                          onSelectedChange={handlePaletteChange}
                          dimensions={MORE_STYLE_DIMENSIONS}
                          selectionMode="single"
                          showClear={false}
                        />
                      </div>
                    )}
                  </div>

                  <SelectionChips
                    selected={normalizedSelection}
                    onRemove={handleRemoveDimension}
                    onClear={() => handlePaletteChange({})}
                  />
                </div>
              )}

              {activeTab === "saved" && (
                <div
                  id={`${idPrefix}-panel-saved`}
                  role="tabpanel"
                  aria-labelledby={`${idPrefix}-tab-saved`}
                  tabIndex={0}
                  className="space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <SavedStylePanel
                    savedStyles={savedStyles}
                    appliedStyle={appliedStyle}
                    onApply={handleApplyStyle}
                    onClear={handleClearAppliedStyle}
                  />
                </div>
              )}
            </section>

            <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                可隨時移除細節，主題文字會保持不變。
              </p>
              <button
                type="button"
                onClick={() => {
                  const section = activeTab === "saved" ? "styles" : "templates";
                  navigate(`/library?section=${section}`);
                }}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <Library className="h-3.5 w-3.5" aria-hidden="true" />
                開啟素材中心管理
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
