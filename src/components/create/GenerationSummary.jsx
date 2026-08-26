import React from "react";
import { LayoutTemplate, Palette, Ratio, Route } from "lucide-react";

const iconClass = "mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground";

/**
 * 生成前的設定摘要，讓使用者在按下生成之前確認輸出類型與視覺風格。
 */
export default function GenerationSummary({
  templateContext = null,
  stylePreset = null,
  paletteStyleTags = [],
  aspectRatio = "",
}) {
  const tagCount = Array.isArray(paletteStyleTags) ? paletteStyleTags.length : 0;
  const styleName =
    stylePreset?.title || (tagCount > 0 ? "自訂視覺微調" : "尚未選擇風格");

  const rows = [
    {
      icon: <LayoutTemplate className={iconClass} aria-hidden="true" />,
      label: "輸出類型",
      value: templateContext?.title || "尚未選擇",
    },
    {
      icon: <Route className={iconClass} aria-hidden="true" />,
      label: "結構",
      value: templateContext
        ? `${templateContext.moduleCount} 個模組 · ${templateContext.informationFlow}`
        : "尚未設定",
    },
    {
      icon: <Palette className={iconClass} aria-hidden="true" />,
      label: "視覺風格",
      value: tagCount > 0 ? `${styleName} · ${tagCount} 個細節` : styleName,
    },
    {
      icon: <Ratio className={iconClass} aria-hidden="true" />,
      label: "畫面比例",
      value: aspectRatio || "尚未選擇",
    },
  ];

  return (
    <dl className="mt-5 space-y-2 rounded-xl border border-border/70 bg-background/80 p-4 backdrop-blur-sm">
      {rows.map(({ icon, label, value }) => (
        <div key={label} className="flex items-start gap-3 text-xs">
          {icon}
          <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 flex-1 font-medium text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
