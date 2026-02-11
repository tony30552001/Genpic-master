import React from "react";
import { FileText, Trash2 } from "lucide-react";

export default function HistoryCard({ item, style, onLoad, onDelete }) {
  const dateStr = item.createdAt?.seconds
    ? new Date(item.createdAt.seconds * 1000).toLocaleDateString()
    : "剛剛";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group">
      <div
        className="aspect-video w-full bg-slate-100 relative cursor-pointer"
        onClick={() => onLoad(item)}
      >
        <img src={item.imageUrl} alt="Generated" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
      </div>
      <div className="p-3">
        <p className="text-xs text-slate-500 mb-2 line-clamp-2">{item.userScript}</p>
        {style && (
          <div className="mb-2 space-y-1">
            <div className="text-[10px] text-slate-500">風格：{style.name}</div>
            {style.tags && style.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
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
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-slate-400">{dateStr}</span>
          <div className="flex gap-2">
            <button
              onClick={() => onLoad(item)}
              className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-md transition-colors"
              title="Reuse Style"
            >
              <FileText className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 hover:bg-red-50 text-red-500 rounded-md transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
