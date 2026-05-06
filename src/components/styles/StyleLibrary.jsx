import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  Bookmark,
  CheckSquare,
  Filter,
  Loader2,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StyleCard from "./StyleCard";

const SCOPE_OPTIONS = [
  { value: "mine", label: "我的風格", description: "私人與已共享的個人風格" },
  { value: "shared", label: "共享風格", description: "公司內已共享的團隊風格" },
];

const SORT_OPTIONS = [
  { value: "updated", label: "最近更新" },
  { value: "newest", label: "最新共享" },
  { value: "popular", label: "熱門" },
  { value: "curated", label: "精選優先" },
];

export default function StyleLibrary({
  savedStyles,
  isLoading,
  isSearching,
  error,
  searchQuery,
  onSearchChange,
  scope,
  onScopeChange,
  sort,
  onSortChange,
  onApplyStyle,
  onDeleteStyle,
  onDeleteStyles,
  onPublishStyle,
  onUnpublishStyle,
  onCopyStyle,
  onGoCreate,
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [showAllTags, setShowAllTags] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const allTags = useMemo(() => {
    const tagCount = {};
    savedStyles.forEach((style) => {
      (style.tags || []).forEach((tag) => {
        const t = tag.trim();
        if (t) tagCount[t] = (tagCount[t] || 0) + 1;
      });
    });
    return Object.entries(tagCount)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [savedStyles]);

  const filtered = useMemo(() => {
    if (selectedTags.length === 0) return savedStyles;
    return savedStyles.filter((style) =>
      selectedTags.every((filterTag) =>
        style.tags?.some((tag) => tag.toLowerCase() === filterTag.toLowerCase())
      )
    );
  }, [savedStyles, selectedTags]);

  const visibleTags = showAllTags ? allTags : allTags.slice(0, 12);
  const hasMoreTags = allTags.length > 12;
  const hasActiveFilters = selectedTags.length > 0 || searchQuery;
  const isMineScope = scope === "mine";

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    onSearchChange("");
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((value) => !value);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((style) => style.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (confirm(`確定要刪除選取的 ${selectedIds.size} 個風格嗎？`)) {
      await onDeleteStyles(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const emptyTitle = hasActiveFilters
    ? "找不到符合的風格"
    : isMineScope
      ? "尚未收藏任何風格"
      : "團隊尚未共享風格";
  const emptyDescription = hasActiveFilters
        ? "嘗試調整搜尋或標籤分類。"
    : isMineScope
      ? "分析圖片風格後即可儲存到此處。"
      : "共享你的第一個風格，讓團隊成員可以一起套用。";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-4 shadow-sm lg:p-5">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">風格庫</h2>
              <p className="text-sm text-muted-foreground">
                以標籤快速分類與篩選風格，管理個人收藏或套用公司內共享資產。
              </p>
            </div>

            <div className="flex rounded-xl border border-border bg-muted/40 p-1" role="group" aria-label="風格庫範圍">
              {SCOPE_OPTIONS.map((option) => {
                const active = scope === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={active}
                    onClick={() => {
                      onScopeChange(option.value);
                      setSelectedIds(new Set());
                      setIsSelectionMode(false);
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${active
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground"
                      }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <Input
                type="text"
                placeholder="搜尋風格名稱、描述、作者或標籤…"
                aria-label="搜尋風格"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 pr-10"
              />
              {isSearching && (
                <Loader2 className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              )}
              {searchQuery && !isSearching && (
                <button
                  type="button"
                  onClick={() => onSearchChange("")}
                  className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="清除搜尋"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              排序
              <select
                value={sort}
                onChange={(e) => onSortChange(e.target.value)}
                className="h-10 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="風格排序"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-medium text-muted-foreground">標籤分類</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto rounded-md px-2 py-1 text-xs text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  清除篩選
                </button>
              )}
            </div>
            {allTags.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedTags([])}
                    aria-pressed={selectedTags.length === 0}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedTags.length === 0
                      ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                      : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      }`}
                  >
                    全部標籤
                  </button>
                  {visibleTags.map(({ tag, count }) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${active
                          ? "border-primary bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                          : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          }`}
                      >
                        <span>#{tag}</span>
                        <span className={`text-[10px] ${active ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  {hasMoreTags && (
                    <button
                      type="button"
                      onClick={() => setShowAllTags((value) => !value)}
                      className="rounded-md px-2 py-1 text-xs text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {showAllTags ? "收合" : `+${allTags.length - 12} 更多`}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                尚無標籤；儲存風格時加入標籤後，這裡會自動形成分類。
              </p>
            )}
          </div>
        </div>
      </section>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {isSelectionMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 animate-in fade-in slide-in-from-top-2 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input
              type="checkbox"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={selectAll}
              aria-label="選取全部風格"
              className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
            />
            已選取 {selectedIds.size} 個風格
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIsSelectionMode(false)}>
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              刪除選取項目
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground">
          {hasActiveFilters ? (
            <>
              找到 <strong className="text-foreground">{filtered.length}</strong> 個風格
            </>
          ) : (
            <>共 {savedStyles.length} 個風格</>
          )}
        </div>
        {isMineScope && !isSelectionMode && savedStyles.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSelectionMode}
            className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-primary"
          >
            <CheckSquare className="h-3.5 w-3.5" aria-hidden="true" />
            批次管理
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center rounded-2xl border border-dashed border-border py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          載入風格中…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Bookmark className="h-7 w-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{emptyTitle}</p>
            <p className="mt-1 text-xs text-muted-foreground/80">{emptyDescription}</p>
          </div>
          {hasActiveFilters ? (
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              清除所有篩選
            </Button>
          ) : isMineScope && onGoCreate ? (
            <Button type="button" size="sm" onClick={onGoCreate}>
              前往建立風格
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {filtered.map((style) => {
            const canManage = isMineScope;
            return (
              <StyleCard
                key={style.id}
                style={style}
                onApply={onApplyStyle}
                onDelete={canManage ? onDeleteStyle : undefined}
                onPublish={canManage && style.visibility !== "shared" ? onPublishStyle : undefined}
                onUnpublish={canManage && style.visibility === "shared" ? onUnpublishStyle : undefined}
                onCopy={!canManage ? onCopyStyle : undefined}
                selectedTags={selectedTags}
                onToggleTag={toggleTag}
                isSelectionMode={isSelectionMode}
                isSelected={selectedIds.has(style.id)}
                onToggleSelect={toggleSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
