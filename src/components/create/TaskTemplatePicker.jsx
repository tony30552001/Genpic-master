import React from "react";
import {
  ArrowDown,
  ArrowRight,
  Check,
  CircleHelp,
  LayoutTemplate,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TASK_TEMPLATES,
  buildTaskTemplateContext,
  getTaskTemplate,
} from "./styleSourceData";

const TEMPLATE_ART = {
  infographic: {
    className: "bg-blue-50 dark:bg-blue-950/40",
    content: (
      <>
        <span className="absolute left-3 top-3 h-2 w-20 rounded-full bg-blue-700/80 dark:bg-blue-300/80" />
        <span className="absolute left-3 top-8 h-2 w-12 rounded-full bg-blue-500/40" />
        <span className="absolute bottom-3 left-3 h-14 w-12 rounded-lg bg-white shadow-sm dark:bg-blue-100/90" />
        <span className="absolute bottom-3 left-[4.5rem] h-14 w-16 rounded-lg bg-blue-200/80 dark:bg-blue-300/60" />
        <ArrowRight className="absolute bottom-7 right-4 h-5 w-5 text-blue-700/70 dark:text-blue-200" aria-hidden="true" />
      </>
    ),
  },
  poster: {
    className: "bg-amber-50 dark:bg-amber-950/40",
    content: (
      <>
        <span className="absolute left-1/2 top-6 h-20 w-20 -translate-x-1/2 rounded-full bg-amber-400/70" />
        <span className="absolute bottom-4 left-1/2 h-2 w-24 -translate-x-1/2 rounded-full bg-amber-900/55 dark:bg-amber-200/70" />
        <span className="absolute bottom-1 left-1/2 h-2 w-14 -translate-x-1/2 rounded-full bg-amber-700/30" />
      </>
    ),
  },
  product: {
    className: "bg-emerald-50 dark:bg-emerald-950/40",
    content: (
      <>
        <span className="absolute bottom-4 left-8 h-20 w-16 rounded-xl bg-white shadow-md dark:bg-emerald-100/90" />
        <span className="absolute bottom-7 left-12 h-8 w-8 rounded-full bg-emerald-400/70" />
        <span className="absolute right-5 top-5 h-12 w-20 rounded-lg border-2 border-emerald-700/40 dark:border-emerald-200/60" />
        <span className="absolute right-5 top-[4.5rem] h-2 w-14 rounded-full bg-emerald-700/40 dark:bg-emerald-200/60" />
      </>
    ),
  },
  storyboard: {
    className: "bg-violet-50 dark:bg-violet-950/40",
    content: (
      <>
        <span className="absolute left-3 top-4 h-12 w-20 rounded-lg border-2 border-violet-700/35 dark:border-violet-200/60" />
        <span className="absolute left-[6.5rem] top-4 h-12 w-20 rounded-lg border-2 border-violet-700/35 dark:border-violet-200/60" />
        <span className="absolute bottom-4 left-3 h-12 w-20 rounded-lg border-2 border-violet-700/35 dark:border-violet-200/60" />
        <span className="absolute bottom-4 left-[6.5rem] h-12 w-20 rounded-lg border-2 border-violet-700/35 dark:border-violet-200/60" />
      </>
    ),
  },
};

function TemplatePreview({ templateId }) {
  const art = TEMPLATE_ART[templateId] || TEMPLATE_ART.infographic;

  return (
    <span
      className={cn(
        "relative block h-28 overflow-hidden rounded-xl border border-border/70",
        art.className
      )}
      aria-hidden="true"
    >
      {art.content}
    </span>
  );
}

function OptionGroup({ label, values, selectedValue, onSelect }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {values.map((value) => {
          const isSelected = selectedValue === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(value)}
              className={cn(
                "min-h-11 touch-manipulation rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function TaskTemplatePicker({
  context,
  onChange,
  templates = TASK_TEMPLATES,
}) {
  const selectedTemplate = context?.id ? getTaskTemplate(context.id) : null;

  const handleSelect = (template) => {
    onChange?.(buildTaskTemplateContext(template));
  };

  return (
    <section className="space-y-4" aria-labelledby="task-template-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-primary">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-1.5">
              01
            </span>
            輸出類型
          </p>
          <h3 id="task-template-title" className="text-base font-semibold text-foreground">
            先決定內容要怎麼被讀懂
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            範本只提供版面與敘事規則，不會改寫你的主題文字。
          </p>
        </div>
        <span className="inline-flex min-h-9 items-center gap-1.5 self-start rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
          結構化提示
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="輸出類型">
        {templates.map((template) => {
          const isSelected = selectedTemplate?.id === template.id;
          return (
            <button
              key={template.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={template.title}
              data-template-id={template.id}
              onClick={() => handleSelect(template)}
              className={cn(
                "group min-w-0 rounded-2xl border bg-background p-2.5 text-left transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected
                  ? "border-primary bg-primary/[0.04] shadow-md ring-1 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              )}
            >
              <TemplatePreview templateId={template.id} />
              <span className="flex items-start gap-2 px-1 pb-1 pt-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {template.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {template.description}
                  </span>
                  <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                    {template.badge}
                  </span>
                </span>
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors",
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-transparent group-hover:border-primary/40"
                  )}
                  aria-hidden="true"
                >
                  <Check className="h-4 w-4" />
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selectedTemplate && context ? (
        <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/[0.035] p-3 sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">
                  {selectedTemplate.title}設定
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  AI 會把這些規則與你的主題一起理解。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChange?.(null)}
              className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="移除輸出類型"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              不指定
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <OptionGroup
              label="模組數量"
              values={selectedTemplate.moduleOptions}
              selectedValue={context.moduleCount}
              onSelect={(moduleCount) =>
                onChange?.({ ...context, moduleCount })
              }
            />
            <OptionGroup
              label="資訊流方向"
              values={selectedTemplate.flowOptions}
              selectedValue={context.informationFlow}
              onSelect={(informationFlow) =>
                onChange?.({ ...context, informationFlow })
              }
            />
          </div>

          <div className="grid gap-3 border-t border-primary/15 pt-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <CircleHelp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                範本規則
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {selectedTemplate.guidance.map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden="true" />
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <ArrowDown className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                避免事項
              </p>
              <ul className="space-y-1.5 text-xs leading-relaxed text-muted-foreground">
                {selectedTemplate.pitfalls.map((pitfall) => (
                  <li key={pitfall} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500/80" aria-hidden="true" />
                    <span>{pitfall}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-dashed border-border bg-muted/25 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>未指定時，AI 會保留你的主題重點，不附加特定輸出結構。</span>
        </div>
      )}
    </section>
  );
}
