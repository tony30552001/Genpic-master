import React from "react";
import { Plus, Trash2 } from "lucide-react";

export default function StyleCard({ style, onApply, onDelete }) {
  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-3 hover:shadow-md transition-all group relative cursor-pointer"
      onClick={() => onApply(style)}
    >
      <div className="flex justify-between items-start mb-2">
        <h4 className="font-bold text-slate-700 text-sm">{style.name}</h4>
        <button
          onClick={(e) => onDelete(style.id, e)}
          className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-3 line-clamp-2 leading-relaxed">
        {style.description || "無描述"}
      </p>
      {style.tags && style.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {style.tags.map((tag, i) => (
            <span
              key={i}
              className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
      <div className="text-[10px] text-indigo-500 font-medium flex items-center gap-1 mt-2">
        點擊套用此風格 <Plus className="w-3 h-3" />
      </div>
    </div>
  );
}
