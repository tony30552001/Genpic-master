import React from "react";
import { FileText, Palette } from "@/components/icons/lucideContent";

const QUICK_LIMIT = 3;

const getSeconds = (item) => {
  const value = item.updatedAt || item.publishedAt || item.createdAt;
  if (!value) return 0;
  if (typeof value === "number") return value > 1e12 ? value / 1000 : value;
  if (typeof value === "string") {
    const milliseconds = Date.parse(value);
    return Number.isNaN(milliseconds) ? 0 : milliseconds / 1000;
  }
  return typeof value.seconds === "number" ? value.seconds : 0;
};

const newest = (items) =>
  [...items].sort((a, b) => getSeconds(b) - getSeconds(a)).slice(0, QUICK_LIMIT);

function QuickChip({ label, kind, previewUrl, onClick }) {
  const Icon = kind === "風格" ? Palette : FileText;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`套用${kind}：${label}`}
      className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-border bg-card py-1 pl-1 pr-3 text-left press-feedback hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {previewUrl ? (
        <img src={previewUrl} alt="" loading="lazy" className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-primary/60">
          <Icon className="icon-sm" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block max-w-32 truncate text-sm leading-tight">{label}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">{kind}</span>
      </span>
    </button>
  );
}

/** 圖片頁頂端的快速套用列：最近的風格與範本，一鍵帶回創作頁。 */
export default function QuickApplyStrip({ templates, savedStyles, onApplyTemplate, onApplyStyle }) {
  const styles = newest(savedStyles);
  const recentTemplates = newest(templates);

  if (styles.length === 0 && recentTemplates.length === 0) {
    return (
      <p className="px-1 text-xs text-muted-foreground">
        在圖片詳情按「存成風格」或「存成範本」，常用的組合會出現在這裡，一鍵套用。
      </p>
    );
  }

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar" role="group" aria-label="快速套用">
      <span className="shrink-0 pr-1 text-xs text-muted-foreground">快速套用</span>
      {styles.map((style) => (
        <QuickChip
          key={`style-${style.id}`}
          kind="風格"
          label={style.name}
          previewUrl={style.previewUrl}
          onClick={() => onApplyStyle(style)}
        />
      ))}
      {recentTemplates.map((template) => (
        <QuickChip
          key={`template-${template.id}`}
          kind="範本"
          label={template.name}
          previewUrl={template.previewUrl}
          onClick={() => onApplyTemplate(template)}
        />
      ))}
    </div>
  );
}
