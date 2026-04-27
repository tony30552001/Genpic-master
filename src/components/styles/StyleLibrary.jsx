import React, { useMemo, useState } from "react";
import { Bookmark, CheckSquare, Filter, Loader2, Search, Trash2, X } from "lucide-react";
import StyleCard from "./StyleCard";
import { Input } from "@/components/ui/input";

export default function StyleLibrary({
  savedStyles,
  isSearching,
  searchQuery,
  onSearchChange,
  onApplyStyle,
  onDeleteStyle,
  onDeleteStyles, // 新增：批次刪除 callback
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [showAllTags, setShowAllTags] = useState(false);

  // 批次操作狀態
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  // 收集所有標籤及其出現次數
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

  // 顯示的標籤（預設最多 12 個）
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 12);
  const hasMoreTags = allTags.length > 12;

  // 根據搜尋和標籤篩選
  const filtered = useMemo(() => {
    return savedStyles.filter((style) => {
      // 搜尋文字篩選
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        !q ||
        style.name.toLowerCase().includes(q) ||
        style.description?.toLowerCase().includes(q) ||
        style.tags?.some((tag) => tag.toLowerCase().includes(q));

      // 標籤篩選
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.every((filterTag) =>
          style.tags?.some((t) => t.toLowerCase() === filterTag.toLowerCase())
        );

      return matchesSearch && matchesTags;
    });
  }, [savedStyles, searchQuery, selectedTags]);

  const toggleTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSelectedTags([]);
    onSearchChange("");
  };

  const hasActiveFilters = selectedTags.length > 0 || searchQuery;

  // --- 批次操作邏輯 ---
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`確定要刪除選取的 ${selectedIds.size} 個風格嗎？`)) {
      onDeleteStyles(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="space-y-5">
      {/* 搜尋與篩選區 */}
      <div className="space-y-3">
        {/* 搜尋列 */}
        <div className="relative">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3 pointer-events-none" />
          <Input
            type="text"
            placeholder="搜尋風格名稱、描述或標籤…"
            aria-label="搜尋風格"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 pr-10"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-primary absolute right-3.5 top-3 animate-spin" />
          )}
          {searchQuery && !isSearching && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2 top-1.5 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="清除搜尋"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* 標籤篩選區 */}
        {allTags.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">標籤篩選</span>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="ml-auto rounded-md px-1 text-[11px] text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  清除篩選
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visibleTags.map(({ tag, count }) => {
                const isActive = selectedTags.includes(tag);
                return (
                  <button
                    type="button"
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    aria-pressed={isActive}
                    className={`
                       inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                      ${isActive
                        ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/25"
                        : "bg-background text-foreground border-border hover:border-primary/40 hover:text-primary hover:bg-primary/5"
                      }
                    `}
                  >
                    <span>#{tag}</span>
                    <span
                      className={`text-[10px] ${isActive ? "text-primary-foreground/60" : "text-muted-foreground"
                        }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {hasMoreTags && (
                <button
                  type="button"
                  onClick={() => setShowAllTags(!showAllTags)}
                  className="rounded-md px-2 py-1 text-xs text-primary transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {showAllTags ? "收合" : `+${allTags.length - 12} 更多`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {isSelectionMode && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={selectAll}
                aria-label="選取全部風格"
                className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
              />
              <span className="text-sm font-medium text-foreground">
                已選取 {selectedIds.size} 個風格
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSelectionMode(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground bg-background border border-border rounded-lg shadow-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 text-xs text-destructive-foreground bg-destructive hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              刪除選取項目
            </button>
          </div>
        </div>
      )}

      {/* 結果計數與操作列 */}
      <div className="flex items-center justify-between px-1">
        {hasActiveFilters ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              找到 <strong className="text-foreground">{filtered.length}</strong> 個風格
            </span>
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-1">
                <span>·</span>
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-primary bg-primary/5 px-1.5 py-0.5 rounded-md"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="ml-0.5 rounded-sm transition-colors hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`移除標籤 ${tag}`}
                    >
                      <X className="w-2.5 h-2.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">共 {savedStyles.length} 個風格</div>
        )}

        {!isSelectionMode && savedStyles.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectionMode}
            className="text-xs font-medium text-muted-foreground hover:text-primary flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
            批次管理
          </button>
        )}
      </div>

      {/* Grid 顯示 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
            <Bookmark className="w-7 h-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {hasActiveFilters ? "找不到符合的風格" : "尚未收藏任何風格"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              {hasActiveFilters
                ? "嘗試調整搜尋條件或清除篩選"
                : "分析圖片風格後即可儲存到此處"}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs text-primary hover:text-primary/70 mt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-md px-2 py-1"
            >
              清除所有篩選
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((style) => (
            <StyleCard
              key={style.id}
              style={style}
              onApply={onApplyStyle}
              onDelete={onDeleteStyle}
              selectedTags={selectedTags}
              onToggleTag={toggleTag}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(style.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
