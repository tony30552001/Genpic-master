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
      ? new Date(item.createdAt.seconds * 1000).toLocaleDateString()
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            placeholder="搜尋文字、日期或風格..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-10 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 批次操作列 */}
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
                已選取 {selectedIds.size} 筆紀錄
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
            <button
              onClick={handleCompare}
              disabled={selectedIds.size !== 2}
              className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              title="請選擇 2 筆紀錄進行比對"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
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
        <div className="text-xs text-slate-500">
          {searchQuery ? (
            <span>找到 <strong className="text-slate-700">{filtered.length}</strong> 筆紀錄</span>
          ) : (
            <span>共 {historyItems.length} 筆紀錄</span>
          )}
        </div>

        {!isSelectionMode && historyItems.length > 0 && (
          <button
            onClick={toggleSelectionMode}
            className="text-xs font-medium text-slate-500 hover:text-blue-600 flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
          >
            <CheckSquare className="w-3.5 h-3.5" />
            批次管理
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center">
            <Bookmark className="w-7 h-7 text-slate-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">
              {searchQuery ? "找不到符合的紀錄" : "尚無生成紀錄"}
            </p>
          </div>
          {!searchQuery && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <button
                type="button"
                onClick={onGoCreate}
                className="px-3 py-1.5 rounded-lg text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
              >
                <Wand2 className="w-3 h-3" /> 前往製作區
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
