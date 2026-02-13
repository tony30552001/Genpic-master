import React, { useMemo, useState } from "react";
import { Bookmark, CheckSquare, Filter, Loader2, Search, Trash2, X } from "lucide-react";
import StyleCard from "./StyleCard";

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
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="搜尋風格名稱、描述或標籤..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 text-blue-500 absolute right-3.5 top-3 animate-spin" />
          )}
          {searchQuery && !isSearching && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* 標籤篩選區 */}
        {allTags.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-medium text-slate-500">標籤篩選</span>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="ml-auto text-[11px] text-blue-500 hover:text-blue-700 transition-colors"
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
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`
                      inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-all duration-200
                      ${isActive
                        ? "bg-blue-500 text-white border-blue-500 shadow-sm shadow-blue-500/25"
                        : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50"
                      }
                    `}
                  >
                    <span>#{tag}</span>
                    <span
                      className={`text-[10px] ${isActive ? "text-blue-200" : "text-slate-400"
                        }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
              {hasMoreTags && (
                <button
                  onClick={() => setShowAllTags(!showAllTags)}
                  className="text-xs text-blue-500 hover:text-blue-700 px-2 py-1 transition-colors"
                >
                  {showAllTags ? "收合" : `+${allTags.length - 12} 更多`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {isSelectionMode && (
        <div className="flex items-center justify-between bg-blue-50/80 border border-blue-100 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={selectAll}
                className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-blue-900">
                已選取 {selectedIds.size} 個風格
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSelectionMode(false)}
              className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 bg-white border border-slate-200 rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              刪除選取項目
            </button>
          </div>
        </div>
      )}

      {/* 結果計數與操作列 */}
      <div className="flex items-center justify-between px-1">
        {hasActiveFilters ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>
              找到 <strong className="text-slate-700">{filtered.length}</strong> 個風格
            </span>
            {selectedTags.length > 0 && (
              <div className="flex items-center gap-1">
                <span>·</span>
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md"
                  >
                    #{tag}
                    <button
                      onClick={() => toggleTag(tag)}
                      className="hover:text-blue-800 ml-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs text-slate-500">共 {savedStyles.length} 個風格</div>
        )}

        {!isSelectionMode && savedStyles.length > 0 && (
          <button
            onClick={toggleSelectionMode}
            className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            批次管理
          </button>
        )}
      </div>

      {/* Grid 顯示 */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Bookmark className="w-7 h-7 text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">
              {hasActiveFilters ? "找不到符合的風格" : "尚未收藏任何風格"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {hasActiveFilters
                ? "嘗試調整搜尋條件或清除篩選"
                : "分析圖片風格後即可儲存到此處"}
            </p>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-500 hover:text-blue-700 mt-1 transition-colors"
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
