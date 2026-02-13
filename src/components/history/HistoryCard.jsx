import React, { useState } from "react";
import { FileText, Image as ImageIcon, Trash2 } from "lucide-react";

export default function HistoryCard({
  item,
  style,
  onLoad,
  onDelete,
  isSelected,
  isSelectionMode,
  onToggleSelect,
}) {
  const [imgError, setImgError] = useState(false);
  const dateStr = item.createdAt?.seconds
    ? new Date(item.createdAt.seconds * 1000).toLocaleDateString()
    : "剛剛";

  const handleClick = (e) => {
    if (isSelectionMode) {
      e.preventDefault();
      onToggleSelect(item.id);
    } else {
      onLoad(item);
    }
  };

  return (
    <div
      className={`group relative bg-white border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col ${isSelected
        ? "border-blue-500 ring-2 ring-blue-500/20 shadow-md transform scale-[0.98]"
        : "border-slate-200 hover:shadow-lg hover:border-blue-200"
        }`}
      onClick={handleClick}
    >
      {/* 預覽圖區域 */}
      <div className="relative aspect-video bg-gradient-to-br from-slate-50 to-slate-100 overflow-hidden">
        {!imgError && item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt="Generated"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 text-slate-200 mx-auto mb-1" />
              <span className="text-[10px] text-slate-300">無預覽</span>
            </div>
          </div>
        )}

        {/* 選擇模式下的 Checkbox 遮罩 */}
        {isSelectionMode && (
          <div
            className={`absolute inset-0 transition-colors flex items-start justify-end p-2 ${isSelected ? "bg-blue-500/20" : "bg-black/0 hover:bg-black/5"
              }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                ? "bg-blue-500 border-blue-500"
                : "bg-white/80 border-slate-300"
                }`}
            >
              {isSelected && <div className="w-2 h-2 bg-white rounded-full" />}
            </div>
          </div>
        )}

        {/* hover 遮罩與操作按鈕 (僅在非選擇模式下顯示) */}
        {!isSelectionMode && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onLoad(item);
              }}
              className="bg-white/90 backdrop-blur-sm text-slate-700 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-lg flex items-center gap-1"
            >
              <FileText className="w-3 h-3" /> 載入設定
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id, e);
              }}
              className="bg-white/90 backdrop-blur-sm text-slate-700 hover:bg-red-500 hover:text-white p-1.5 rounded-lg transition-all shadow-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 資訊區 */}
      <div className="flex-1 p-3 flex flex-col gap-2">
        {/* 腳本摘要 */}
        <p className="text-sm text-slate-700 line-clamp-2 leading-relaxed h-11 font-medium">
          {item.userScript || "無內容"}
        </p>

        {/* 風格資訊與日期 */}
        <div className="mt-auto pt-2 border-t border-slate-50 flex items-center justify-between">
          <div className="flex flex-col gap-0.5 max-w-[70%]">
            {style ? (
              <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md w-fit truncate max-w-full">
                {style.name}
              </span>
            ) : (
              <span className="text-[10px] text-slate-400">無特定風格</span>
            )}
          </div>
          <span className="text-[10px] text-slate-400 shrink-0">{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
