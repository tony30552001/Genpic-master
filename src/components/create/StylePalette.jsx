import React, { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const STYLE_DIMENSIONS = [
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
 * StylePalette — 8 維度風格屬性調色盤（受控元件）
 * selected: { dimensionId: string[] }  由父元件管理
 * onSelectedChange(newSelected): 通知父元件更新
 */
export default function StylePalette({ selected = {}, onSelectedChange }) {
  const [collapsed, setCollapsed] = useState(false);

  const activeCount = useMemo(
    () => STYLE_DIMENSIONS.reduce((sum, d) => sum + (selected[d.id]?.length ?? 0), 0),
    [selected]
  );

  const toggleTag = useCallback(
    (dimensionId, tag) => {
      const dimTags = selected[dimensionId] || [];
      const isActive = dimTags.includes(tag);
      const next = isActive
        ? { ...selected, [dimensionId]: dimTags.filter((t) => t !== tag) }
        : { ...selected, [dimensionId]: [...dimTags, tag] };
      onSelectedChange?.(next);
    },
    [selected, onSelectedChange]
  );

  const handleClear = useCallback(() => {
    onSelectedChange?.({});
  }, [onSelectedChange]);

  return (
    <Card className="rounded-2xl border-border bg-card shadow-md ring-1 ring-border/40">
      {/* Card header — 可點擊收合，與「參考與風格」保持一致 */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-expanded={!collapsed}
      >
        <span className="min-w-0 space-y-0.5">
          <span className="block text-sm font-semibold text-foreground">風格調色盤</span>
          <span className="block truncate text-xs text-muted-foreground">
            選擇畫風、情緒、光線等維度，精確引導生圖風格。
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {activeCount > 0 && (
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 px-2 py-0 text-primary"
            >
              已套用 {activeCount}
            </Badge>
          )}
          {collapsed ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
      </button>

      {!collapsed && (
        <CardContent className="border-t border-border bg-background/80 p-4 space-y-4">
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

          {/* 清空風格 */}
          <div className="border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={handleClear}
              className="rounded-lg border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              清空風格
            </button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
