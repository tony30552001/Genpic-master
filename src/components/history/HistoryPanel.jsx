import React from "react";
import { Bookmark, Search, Wand2 } from "lucide-react";
import HistoryCard from "./HistoryCard";

export default function HistoryPanel({
  historyItems,
  savedStyles,
  searchQuery,
  onSearchChange,
  onLoad,
  onDelete,
  onGoStyles,
  onGoCreate,
}) {
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

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="搜尋內容或日期 (YYYY-MM-DD)..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm space-y-4">
          <div>{searchQuery ? "找不到符合的紀錄" : "尚無生成紀錄"}</div>
          {!searchQuery && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={onGoCreate}
                className="px-3 py-1.5 rounded-md text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors inline-flex items-center gap-1"
              >
                <Wand2 className="w-3 h-3" /> 前往製作區
              </button>
              <button
                type="button"
                onClick={onGoStyles}
                className="px-3 py-1.5 rounded-md text-xs bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300 transition-colors inline-flex items-center gap-1"
              >
                <Bookmark className="w-3 h-3" /> 前往風格庫
              </button>
            </div>
          )}
        </div>
      ) : (
        filtered.map((item) => (
          <HistoryCard
            key={item.id}
            item={item}
            style={item.styleId ? styleMap[item.styleId] : null}
            onLoad={onLoad}
            onDelete={onDelete}
          />
        ))
      )}
    </div>
  );
}
