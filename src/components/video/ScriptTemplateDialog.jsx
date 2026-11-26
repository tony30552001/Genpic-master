import React, { useState } from "react";
import { Copy, Download } from "@/components/icons/lucideControls";
import { Check } from "@/components/icons/lucideStatus";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  SCRIPT_TEMPLATE_FILES,
  SCRIPT_TEMPLATE_LIMITS,
  SCRIPT_TEMPLATE_NOTES,
  SCRIPT_TEMPLATE_STEPS,
  buildScriptPrompt,
} from "@/lib/videoScriptTemplate";

const PROMPT = buildScriptPrompt();

// Below lg the dialog fills the screen and only fades; the centered slide offsets would jump.
const MOBILE_FULL_SCREEN =
  "max-lg:inset-0 max-lg:h-dvh max-lg:max-h-none max-lg:max-w-none sm:max-lg:max-w-none max-lg:translate-x-0 max-lg:translate-y-0 max-lg:rounded-none max-lg:border-0 sm:max-lg:rounded-none max-lg:data-[state=open]:slide-in-from-left-0 max-lg:data-[state=open]:slide-in-from-top-0 max-lg:data-[state=open]:zoom-in-100 max-lg:data-[state=closed]:slide-out-to-left-0 max-lg:data-[state=closed]:slide-out-to-top-0 max-lg:data-[state=closed]:zoom-out-100";

function SectionLabel({ children }) {
  return <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground">{children}</h3>;
}

export default function ScriptTemplateDialog({ open, onOpenChange }) {
  const [copyState, setCopyState] = useState({ status: "idle", error: "" });

  const changeOpen = (next) => {
    if (!next) setCopyState({ status: "idle", error: "" });
    onOpenChange(next);
  };

  const copyPrompt = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("瀏覽器不支援剪貼簿");
      await navigator.clipboard.writeText(PROMPT);
      setCopyState({ status: "copied", error: "" });
    } catch (error) {
      setCopyState({ status: "error", error: error?.message || "瀏覽器拒絕寫入" });
    }
  };

  const copied = copyState.status === "copied";

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className={cn("flex max-h-[calc(100dvh-3rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl", MOBILE_FULL_SCREEN)}>
        <DialogHeader className="shrink-0 px-6 pb-3 pt-5 pr-12 text-left max-lg:px-4 max-lg:pt-4">
          <DialogTitle className="whitespace-nowrap">腳本範本與說明</DialogTitle>
          <DialogDescription className="leading-relaxed">
            把部門的 SOP 或教育訓練文件交給 AI，轉成可直接匯入的影片腳本。
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto overscroll-contain px-6 pb-5 pt-1 max-lg:px-4">
          <section>
            <SectionLabel>三步驟</SectionLabel>
            <ol className="grid gap-2 lg:grid-cols-3">
              {SCRIPT_TEMPLATE_STEPS.map((step, index) => (
                <li key={step.title} className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed">
                  <span className="mb-1.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground" aria-hidden="true">
                    {index + 1}
                  </span>
                  <strong className="block text-sm font-semibold">{step.title}</strong>
                  <span className="text-muted-foreground">{step.body}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <SectionLabel>AI 提示詞</SectionLabel>
            <pre
              tabIndex={0}
              aria-label="AI 提示詞內容"
              className="max-h-36 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PROMPT}
            </pre>
          </section>

          <section>
            <SectionLabel>匯入限制</SectionLabel>
            <dl className="grid gap-x-6 lg:grid-cols-2">
              {SCRIPT_TEMPLATE_LIMITS.map(({ label, value }) => (
                <div key={label} className="flex justify-between gap-3 border-b border-border py-2 text-sm">
                  <dt className="whitespace-nowrap text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-foreground/80">
              {SCRIPT_TEMPLATE_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="shrink-0 border-t border-border px-6 py-3 max-lg:px-4 max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {copyState.status === "error" && (
            <p role="alert" className="mb-2 rounded-md bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive">
              無法複製提示詞：{copyState.error}。請選取上方提示詞後按 Ctrl+C 手動複製。
            </p>
          )}
          <p aria-live="polite" className={cn("text-xs text-success", copied ? "mb-2" : "sr-only")}>
            {copied ? "已複製到剪貼簿，貼給 AI 並附上你的文件。" : ""}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2 max-lg:grid max-lg:grid-cols-2">
            <Button type="button" className="max-lg:col-span-2 lg:order-last" onClick={copyPrompt}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "已複製" : "複製 AI 提示詞"}
            </Button>
            <Button asChild variant="outline">
              <a href={SCRIPT_TEMPLATE_FILES.template} download>
                <Download aria-hidden="true" />
                <span className="lg:hidden">下載範本</span>
                <span className="max-lg:hidden">下載 DOCX 範本</span>
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={SCRIPT_TEMPLATE_FILES.example} download>
                <Download aria-hidden="true" />
                <span className="lg:hidden">下載範例</span>
                <span className="max-lg:hidden">下載範例（清潔七步驟）</span>
              </a>
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
