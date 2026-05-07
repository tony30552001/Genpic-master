import React, { useState, useCallback } from "react";
import { Palette, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

const STYLE_DIMENSIONS = [
  {
    id: "paintStyle",
    label: "畫風",
    tags: ["寫實", "插畫", "繪本", "水彩", "像素風", "3D", "電影感"],
  },
  {
    id: "mood",
    label: "情緒",
    tags: ["溫暖", "夢幻", "活力", "安靜", "可愛", "神秘"],
  },
  {
    id: "lighting",
    label: "光線",
    tags: ["柔和光", "逆光", "黃金時刻", "霓虹", "高對比", "夜間"],
  },
  {
    id: "color",
    label: "色彩",
    tags: ["粉彩", "繽紛", "低彩度", "單色", "乾淨", "復古色調"],
  },
  {
    id: "composition",
    label: "構圖",
    tags: ["廣角", "特寫", "極簡", "平面", "史詩", "概念藝術"],
  },
  {
    id: "theme",
    label: "主題",
    tags: ["賽博朋克", "奇幻", "自然", "未來感", "復古", "和風"],
  },
  {
    id: "material",
    label: "材質",
    tags: ["玻璃感", "金屬感", "紙質感", "布料感", "陶瓷感"],
  },
  {
    id: "lens",
    label: "鏡頭",
    tags: ["微距", "移軸", "散景", "長焦", "魚眼"],
  },
];

/**
 * StylePalette — 8 維度風格屬性調色盤
 * 用戶選取的 tag 會組合成風格描述字串，透過 onChange 回傳給父元件。
 */
export default function StylePalette({ onChange }) {
  const [selected, setSelected] = useState({});
  const [isOpen, setIsOpen] = useState(true);

  const totalSelected = Object.values(selected).reduce(
    (sum, tags) => sum + tags.length,
    0
  );

  const toggleTag = useCallback(
    (dimensionId, tag) => {
      setSelected((prev) => {
        const dimTags = prev[dimensionId] || [];
        const isSelected = dimTags.includes(tag);
        const next = isSelected
          ? { ...prev, [dimensionId]: dimTags.filter((t) => t !== tag) }
          : { ...prev, [dimensionId]: [...dimTags, tag] };

        const allTags = STYLE_DIMENSIONS.flatMap((d) => next[d.id] || []);
        onChange?.(allTags.length > 0 ? allTags.join("，") : "");
        return next;
      });
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setSelected({});
    onChange?.("");
  }, [onChange]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40">
      {/* Header / Toggle */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-semibold text-foreground">風格調色盤</span>
          {totalSelected > 0 && (
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-medium text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              {totalSelected} 個已選
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {totalSelected > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden="true" />
              清空
            </Button>
          )}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-border bg-background/80 p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            選擇風格屬性來補強生圖風格，可跨維度多選組合。
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            {STYLE_DIMENSIONS.map(({ id, label, tags }) => (
              <div key={id} className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => {
                    const isSelected = (selected[id] || []).includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleTag(id, tag)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                          isSelected
                            ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-400 dark:bg-teal-950 dark:text-teal-300"
                            : "border-border bg-background text-muted-foreground hover:border-border/80 hover:bg-muted/60 hover:text-foreground"
                        )}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
