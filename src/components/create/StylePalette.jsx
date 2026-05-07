import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

const STYLE_DIMENSIONS = [
  {
    id: "paintStyle",
    label: "畫風",
    tags: ["寫實", "插畫", "繪本", "水彩", "像素風", "3D", "電影感"],
  },
  {
    id: "mood",
    label: "情緒",
    tags: ["溫暖", "夢幻", "活力", "安靜", "可愛"],
  },
  {
    id: "lighting",
    label: "光線",
    tags: ["柔和光", "燈拍", "黃金時刻", "霓虹", "高對比"],
  },
  {
    id: "color",
    label: "色彩",
    tags: ["粉彩", "繽紛", "低彩度", "單色", "乾淨"],
  },
  {
    id: "composition",
    label: "構圖",
    tags: ["廣角", "特寫", "極簡", "平面", "史詩", "概念藝術"],
  },
  {
    id: "theme",
    label: "主題",
    tags: ["賽博朋克", "奇幻", "自然", "未來感", "復古"],
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
 * 對齊多奇生圖工坊 UI：平鋪展開、維度標題粗體、清空按鈕在底部。
 */
export default function StylePalette({ onChange }) {
  const [selected, setSelected] = useState({});

  const toggleTag = useCallback(
    (dimensionId, tag) => {
      setSelected((prev) => {
        const dimTags = prev[dimensionId] || [];
        const isActive = dimTags.includes(tag);
        const next = isActive
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
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">風格調色盤</h3>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-md ring-1 ring-border/40">
        {/* 4 欄 × 2 列維度格線 */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          {STYLE_DIMENSIONS.map(({ id, label, tags }) => (
            <div key={id} className="space-y-2">
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const isActive = (selected[id] || []).includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(id, tag)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        isActive
                          ? "border-teal-400 bg-teal-50 text-teal-700 dark:border-teal-500 dark:bg-teal-950 dark:text-teal-300"
                          : "border-border bg-background text-foreground/70 hover:border-border/70 hover:bg-muted/50 hover:text-foreground"
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

        {/* 清空風格 — 永遠顯示在底部 */}
        <div className="mt-5 pt-4 border-t border-border/60">
          <button
            type="button"
            onClick={handleClear}
            className="rounded-lg border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            清空風格
          </button>
        </div>
      </div>
    </div>
  );
}
