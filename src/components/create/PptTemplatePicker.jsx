import { Check, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

function TemplateGroup({ label, hint, options, value, onChange }) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h4 className="text-sm font-medium text-foreground">{label}</h4>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-pressed={!value}
          className={cn(
            "flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !value
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/50"
          )}
        >
          <span className="flex w-full items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 truncate text-sm font-medium">由 AI 決定</span>
            {!value && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          </span>
          <span className="text-xs text-muted-foreground">依主題自動挑選合適的設計。</span>
        </button>

        {options.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(selected ? null : option.id)}
              aria-pressed={selected}
              className={cn(
                "flex min-w-0 flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              <span className="flex w-full items-center gap-1.5">
                <span className="min-w-0 truncate text-sm font-medium">{option.id}</span>
                {selected && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </span>
              {option.summary && (
                <span className="line-clamp-2 text-xs text-muted-foreground">{option.summary}</span>
              )}
              {option.keywords.length > 0 && (
                <span className="flex flex-wrap gap-1 pt-0.5">
                  {option.keywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="secondary" className="text-[10px] font-normal">
                      {keyword}
                    </Badge>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 受控的 ppt-master 模板選擇器：風格決定視覺調性，版型決定頁面骨架。
 */
export default function PptTemplatePicker({
  templates,
  styleId,
  layoutId,
  onStyleChange,
  onLayoutChange,
  disabled,
}) {
  return (
    <fieldset disabled={disabled} className="space-y-4 disabled:opacity-60">
      <TemplateGroup
        label="設計風格"
        hint="決定配色、字級與整體氣質"
        options={templates.styles || []}
        value={styleId}
        onChange={onStyleChange}
      />
      <TemplateGroup
        label="版面骨架"
        hint="決定頁面的排版結構"
        options={templates.layouts || []}
        value={layoutId}
        onChange={onLayoutChange}
      />
    </fieldset>
  );
}
