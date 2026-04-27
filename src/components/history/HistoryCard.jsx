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
    ? new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric" }).format(new Date(item.createdAt.seconds * 1000))
    : "剛剛";

  const handleClick = (e) => {
    if (isSelectionMode) {
      e.preventDefault();
      onToggleSelect(item.id);
    } else {
      onLoad(item);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(e);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelectionMode ? isSelected : undefined}
      aria-label={isSelectionMode ? "選取此生成紀錄" : "載入此生成紀錄設定"}
      onKeyDown={handleKeyDown}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${isSelected
        ? "border-primary ring-2 ring-primary/20 shadow-md"
        : "border-border hover:border-primary/30 hover:shadow-md"
        }`}
      onClick={handleClick}
    >
      {/* 預覽圖區域 */}
      <div className="relative aspect-video bg-muted overflow-hidden">
        {!imgError && item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt="生成圖片預覽"
            width={640}
            height={360}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transform-none"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" aria-hidden="true" />
              <span className="text-[10px] text-muted-foreground/50">無預覽</span>
            </div>
          </div>
        )}

        {/* 選擇模式下的 Checkbox 遮罩 */}
        {isSelectionMode && (
          <div
            className={`absolute inset-0 flex items-start justify-end p-2 transition-colors ${isSelected ? "bg-primary/20" : "bg-black/0 hover:bg-black/5"
              }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${isSelected
                ? "bg-primary border-primary"
                : "bg-card/80 border-muted-foreground/40"
                }`}
            >
              {isSelected && <div className="w-2 h-2 bg-primary-foreground rounded-full" />}
            </div>
          </div>
        )}

        {/* hover 遮罩與操作按鈕 (僅在非選擇模式下顯示) */}
        {!isSelectionMode && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/0 opacity-0 transition-[background-color,opacity] duration-200 group-hover:bg-black/35 group-hover:opacity-100 group-focus-visible:bg-black/35 group-focus-visible:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLoad(item);
              }}
              className="flex h-10 items-center gap-1 rounded-lg bg-background/95 px-3 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <FileText className="w-3 h-3" aria-hidden="true" /> 載入設定
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id, e);
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-background/95 text-foreground shadow-lg backdrop-blur-sm transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="刪除此生成紀錄"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* 資訊區 */}
      <div className="flex-1 p-3 flex flex-col gap-2">
        {/* 腳本摘要 */}
        <p className="text-sm text-foreground line-clamp-2 leading-relaxed h-11 font-medium">
          {item.userScript || "無內容"}
        </p>

        {/* 風格資訊與日期 */}
        <div className="mt-auto pt-2 border-t border-border/60 flex items-center justify-between">
          <div className="flex flex-col gap-0.5 max-w-[70%]">
            {style ? (
              <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-md w-fit truncate max-w-full">
                {style.name}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground">無特定風格</span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">{dateStr}</span>
        </div>
      </div>
    </div>
  );
}
