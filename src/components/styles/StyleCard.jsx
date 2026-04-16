import React, { useState } from "react";
import { Copy, ExternalLink, Image as ImageIcon, Trash2 } from "lucide-react";

export default function StyleCard({
  style,
  onApply,
  onDelete,
  selectedTags,
  onToggleTag,
  isSelectionMode,
  isSelected,
  onToggleSelect,
}) {
  const [imgError, setImgError] = useState(false);
  const hasPreview = style.previewUrl && !imgError;

  const handleClick = (e) => {
    if (isSelectionMode) {
      e.preventDefault();
      onToggleSelect(style.id);
    } else {
      onApply(style);
    }
  };

  return (
    <div
      className={`group relative bg-card border rounded-xl overflow-hidden transition-all duration-300 cursor-pointer flex flex-col ${isSelected
          ? "border-primary ring-2 ring-primary/20 shadow-md transform scale-[0.98]"
          : "border-border hover:shadow-lg hover:border-primary/30"
        }`}
      onClick={handleClick}
    >
      {/* 預覽圖區域 */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {hasPreview ? (
          <img
            src={style.previewUrl}
            alt={style.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-1" />
              <span className="text-[10px] text-muted-foreground/40">無預覽</span>
            </div>
          </div>
        )}

        {/* 選擇模式下的 Checkbox 遮罩 */}
        {isSelectionMode && (
          <div
            className={`absolute inset-0 transition-colors flex items-start justify-end p-2 ${isSelected ? "bg-primary/20" : "bg-black/0 hover:bg-black/5"
              }`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
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
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-300 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApply(style);
              }}
              className="bg-background/90 backdrop-blur-sm text-foreground hover:bg-primary hover:text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 shadow-lg flex items-center gap-1"
            >
              <Copy className="w-3 h-3" /> 套用
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(style.id, e);
              }}
              className="bg-background/90 backdrop-blur-sm text-foreground hover:bg-destructive hover:text-destructive-foreground p-1.5 rounded-lg transition-all duration-150 shadow-lg"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 資訊區 */}
      <div className="flex-1 p-3 flex flex-col gap-2">
        {/* 標題 */}
        <h4 className="font-semibold text-foreground text-sm leading-snug line-clamp-1 group-hover:text-primary transition-colors duration-150">
          {style.name}
        </h4>

        {/* 描述 */}
        {style.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {style.description}
          </p>
        )}

        {/* 標籤 */}
        {style.tags && style.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-auto pt-1">
            {style.tags.slice(0, 4).map((tag, i) => {
              const isActive = selectedTags?.includes(tag);
              return (
                <button
                  key={i}
                  disabled={isSelectionMode}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTag?.(tag);
                  }}
                  className={`
                    text-[10px] px-1.5 py-0.5 rounded-full transition-all duration-150
                    ${isActive
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted/50 text-muted-foreground border border-border hover:border-primary/30 hover:text-primary hover:bg-primary/5"
                    }
                  `}
                >
                  #{tag}
                </button>
              );
            })}
            {style.tags.length > 4 && (
              <span className="text-[10px] text-muted-foreground/60 px-1 py-0.5">
                +{style.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
