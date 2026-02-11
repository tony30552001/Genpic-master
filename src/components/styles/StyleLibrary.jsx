import React from "react";
import { Bookmark, Loader2, Search } from "lucide-react";
import StyleCard from "./StyleCard";

export default function StyleLibrary({
  savedStyles,
  isSearching,
  searchQuery,
  onSearchChange,
  onApplyStyle,
  onDeleteStyle,
}) {
  const filtered = savedStyles.filter((style) => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      style.name.toLowerCase().includes(q) ||
      style.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="搜尋風格名稱或標籤..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-9 py-2 text-sm border border-slate-200 rounded-lg focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
        />
        {isSearching && (
          <Loader2 className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 animate-spin" />
        )}
      </div>

      {isSearching && searchQuery && (
        <div className="text-xs text-slate-400">搜尋中...</div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm flex flex-col items-center gap-2">
          <Bookmark className="w-8 h-8 opacity-50" />
          {searchQuery ? "找不到符合的風格" : "尚未收藏任何風格"}
        </div>
      ) : (
        filtered.map((style) => (
          <StyleCard
            key={style.id}
            style={style}
            onApply={onApplyStyle}
            onDelete={onDeleteStyle}
          />
        ))
      )}
    </div>
  );
}
