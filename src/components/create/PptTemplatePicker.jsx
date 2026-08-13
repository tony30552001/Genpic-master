import { Check, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeLayout, describeStyle } from "./pptTemplateCopy";

function TemplateGroup({ label, hint, options, value, onChange, describe }) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
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
          const copy = describe(option);
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
                <span className="min-w-0 truncate text-sm font-medium">{copy.name}</span>
                {selected && (
                  <Check className="ml-auto h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                )}
              </span>
              {copy.description && (
                <span className="text-xs leading-relaxed text-muted-foreground">
                  {copy.description}
                </span>
              )}
              {(copy.tags?.length > 0 || copy.meta) && (
                <span className="flex flex-wrap items-center gap-1 pt-0.5">
                  {copy.meta && (
                    <span className="text-[10px] text-muted-foreground">{copy.meta}</span>
                  )}
                  {(copy.tags || []).slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] font-normal">
                      {tag}
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
 * 受控的 ppt-master 模板選擇器：風格決定敘事方法與設計預設，版型決定頁面骨架。
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
        hint="決定內容怎麼被論述，以及配色與字級的預設調性"
        options={templates.styles || []}
        value={styleId}
        onChange={onStyleChange}
        describe={describeStyle}
      />
      <TemplateGroup
        label="版面骨架"
        hint="決定每一頁可用的排版結構，全部為 16:9"
        options={templates.layouts || []}
        value={layoutId}
        onChange={onLayoutChange}
        describe={describeLayout}
      />
    </fieldset>
  );
}
