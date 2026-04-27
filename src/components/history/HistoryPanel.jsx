import React, { useState } from "react";
import { Bookmark, CheckSquare, Search, Trash2, Wand2, X, ArrowRightLeft } from "lucide-react";
import HistoryCard from "./HistoryCard";
import ComparisonView from "./ComparisonView";

export default function HistoryPanel({
  historyItems,
  savedStyles,
  searchQuery,
  onSearchChange,
  onLoad,
  onDelete,
  onGoCreate,
  onDeleteItems, // 新增：批次刪除 callback
}) {
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showComparison, setShowComparison] = useState(false);

  const styleMap = (savedStyles || []).reduce((acc, style) => {
    acc[style.id] = style;
    return acc;
  }, {});

  const filtered = historyItems.filter((item) => {
    const q = searchQuery.toLowerCase();
    const dateStr = item.createdAt?.seconds
      ? new Intl.DateTimeFormat("zh-TW").format(new Date(item.createdAt.seconds * 1000))
      : "";
    const scriptText = (item.userScript || "").toLowerCase();
    const style = item.styleId ? styleMap[item.styleId] : null;
    const styleName = style?.name?.toLowerCase() || "";
    const styleTags = style?.tags || [];
    const tagMatch = styleTags.some((tag) => tag.toLowerCase().includes(q));
    return (
      !q ||
      scriptText.includes(q) ||
      dateStr.includes(q) ||
      styleName.includes(q) ||
      tagMatch
    );
  });

  // --- 批次操作邏輯 ---
  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
    setShowComparison(false);
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
      setSelectedIds(new Set(filtered.map((item) => item.id)));
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`確定要刪除選取的 ${selectedIds.size} 筆紀錄嗎？`)) {
      onDeleteItems(Array.from(selectedIds));
      setIsSelectionMode(false);
      setSelectedIds(new Set());
    }
  };

  const handleCompare = () => {
    if (selectedIds.size !== 2) {
      alert("請選擇 2 筆紀錄進行比對");
      return;
    }
    setShowComparison(true);
  };

  // 取得選取的 items 供比對使用
  const selectedItems = filtered.filter(item => selectedIds.has(item.id));

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* 搜尋列 */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3.5 top-2.5 pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            placeholder="搜尋文字、日期或風格…"
            aria-label="搜尋生成紀錄"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-input bg-background py-2 pl-10 pr-10 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          {searchQuery && (
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
      </div>

      {/* 批次操作列 */}
      {isSelectionMode && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={selectAll}
                aria-label="選取全部生成紀錄"
                className="w-4 h-4 rounded border-border text-primary focus:ring-ring cursor-pointer"
              />
              <span className="text-sm font-medium text-foreground">
                已選取 {selectedIds.size} 筆紀錄
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSelectionMode(false)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground shadow-sm transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-xs text-destructive-foreground shadow-sm transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              刪除選取項目
            </button>
            <button
              type="button"
              onClick={handleCompare}
              disabled={selectedIds.size !== 2}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              title="請選擇 2 筆紀錄進行比對"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" aria-hidden="true" />
              比對 (2)
            </button>
          </div>
        </div>
      )}

      {/* 比對與結果顯示區塊 */}
      {showComparison && selectedItems.length === 2 && (
        <ComparisonView
          item1={selectedItems[0]}
          item2={selectedItems[1]}
          onClose={() => setShowComparison(false)}
        />
      )}

      {/* 結果計數與操作按鈕 */}
      <div className="flex items-center justify-between px-1">
        <div className="text-xs text-muted-foreground">
          {searchQuery ? (
            <span>找到 <strong className="text-foreground">{filtered.length}</strong> 筆紀錄</span>
          ) : (
            <span>共 {historyItems.length} 筆紀錄</span>
          )}
        </div>

        {!isSelectionMode && historyItems.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectionMode}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CheckSquare className="w-3.5 h-3.5" aria-hidden="true" />
            批次管理
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center">
            <Bookmark className="w-7 h-7 text-muted-foreground/40" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {searchQuery ? "找不到符合的紀錄" : "尚無生成紀錄"}
            </p>
          </div>
          {!searchQuery && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={onGoCreate}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Wand2 className="w-3 h-3" aria-hidden="true" /> 前往製作區
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
          {filtered.map((item) => (
            <HistoryCard
              key={item.id}
              item={item}
              style={item.styleId ? styleMap[item.styleId] : null}
              onLoad={onLoad}
              onDelete={onDelete}
              isSelectionMode={isSelectionMode}
              isSelected={selectedIds.has(item.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
