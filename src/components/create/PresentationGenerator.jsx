import { useState } from "react";
import {
  BookOpen,
  Check,
  Download,
  Edit2,
  FileText,
  Layers,
  List,
  Loader2,
  Mic,
  Presentation,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { generatePresentationPptx } from "@/services/aiService";
import { sanitizePptxFilename } from "@/utils/pptxExport";

const SLIDE_TYPE_LABELS = {
  cover: "封面",
  section: "章節",
  content: "內容",
  closing: "結尾",
};

const getSlideTypeLabel = (slideType) =>
  SLIDE_TYPE_LABELS[slideType] || SLIDE_TYPE_LABELS.content;

const getSlideBullets = (slide) =>
  Array.isArray(slide?.bullets)
    ? slide.bullets.filter((bullet) => String(bullet).trim())
    : [];

const createDraft = (slide) => ({
  title: slide?.title || "",
  subtitle: slide?.subtitle || "",
  body: slide?.body || "",
  bullets: getSlideBullets(slide).join("\n"),
  speaker_notes: slide?.speaker_notes || "",
});

function SlideEditor({ draft, onChange, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <Input
        value={draft.title}
        onChange={(event) => onChange({ title: event.target.value })}
        placeholder="投影片標題"
        aria-label="投影片標題"
      />
      <Input
        value={draft.subtitle}
        onChange={(event) => onChange({ subtitle: event.target.value })}
        placeholder="副標題或摘要"
        aria-label="投影片副標題"
      />
      <Textarea
        value={draft.body}
        onChange={(event) => onChange({ body: event.target.value })}
        placeholder="補充內容（可選）"
        className="min-h-20 resize-y"
        aria-label="投影片補充內容"
      />
      <Textarea
        value={draft.bullets}
        onChange={(event) => onChange({ bullets: event.target.value })}
        placeholder={"每行一個重點\n第一個重點\n第二個重點"}
        className="min-h-24 resize-y"
        aria-label="投影片重點"
      />
      <Textarea
        value={draft.speaker_notes}
        onChange={(event) => onChange({ speaker_notes: event.target.value })}
        placeholder="講者備注（可選）"
        className="min-h-20 resize-y"
        aria-label="講者備注"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1.5 h-4 w-4" />
          取消
        </Button>
        <Button type="button" size="sm" onClick={onSave}>
          <Check className="mr-1.5 h-4 w-4" />
          儲存
        </Button>
      </div>
    </div>
  );
}

function SlideCard({ slide, index, onUpdate, onRemove }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(() => createDraft(slide));
  const bullets = getSlideBullets(slide);
  const table = slide?.table;
  const chart = slide?.chart;

  const startEditing = () => {
    setDraft(createDraft(slide));
    setIsEditing(true);
  };

  const saveDraft = () => {
    onUpdate(index, {
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      body: draft.body.trim(),
      bullets: draft.bullets
        .split(/\r?\n/)
        .map((bullet) => bullet.trim())
        .filter(Boolean),
      speaker_notes: draft.speaker_notes.trim(),
    });
    setIsEditing(false);
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
            {index + 1}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {slide.title || `投影片 ${index + 1}`}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px]">
                {getSlideTypeLabel(slide.slide_type)}
              </Badge>
              {table ? (
                <span className="text-[10px] text-muted-foreground">含表格</span>
              ) : null}
              {chart ? (
                <span className="text-[10px] text-muted-foreground">含圖表</span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isEditing ? null : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={startEditing}
              aria-label={`編輯第 ${index + 1} 張投影片`}
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            aria-label={`刪除第 ${index + 1} 張投影片`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <CardContent className="p-4">
        {isEditing ? (
          <SlideEditor
            draft={draft}
            onChange={(updates) => setDraft((current) => ({ ...current, ...updates }))}
            onSave={saveDraft}
            onCancel={() => setIsEditing(false)}
          />
        ) : (
          <div className="space-y-3">
            {slide.subtitle ? (
              <p className="text-sm font-medium text-primary">{slide.subtitle}</p>
            ) : null}
            {slide.body ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                {slide.body}
              </p>
            ) : null}
            {bullets.length > 0 ? (
              <ul className="space-y-2 text-sm leading-6 text-foreground">
                {bullets.map((bullet, bulletIndex) => (
                  <li key={`${index}-${bulletIndex}`} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {table ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  {table.title || "原生表格"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {table.headers.length} 欄 · {table.rows.length} 列
                </p>
              </div>
            ) : null}
            {chart ? (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
                <p className="font-semibold text-foreground">
                  {chart.title || "原生圖表"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {chart.labels.length} 個分類 · {chart.series.length} 個系列
                </p>
              </div>
            ) : null}
            {slide.speaker_notes ? (
              <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">講者備注：</span>
                {slide.speaker_notes}
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PresentationGenerator({
  documentResult,
  onUpdateSlide,
  onRemoveSlide,
  onClear,
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const slides = Array.isArray(documentResult?.slides) ? documentResult.slides : [];

  const exportPresentation = async () => {
    if (slides.length === 0) return;

    setIsExporting(true);
    setExportError("");
    try {
      const blob = await generatePresentationPptx({ slides });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${sanitizePptxFilename(documentResult?.title)}-公司範本.pptx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error("Presentation export failed:", error);
      setExportError(error.message || "PowerPoint 匯出失敗，請稍後重試。");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <section className="space-y-4 pb-6">
      <header className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Presentation className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                PPT-master VIP
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">
                {documentResult?.title || "未命名簡報"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                AI 已產生每頁投影片內容。確認文字後，使用公司 16:9 範本匯出可編輯 PPTX。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              重新分析
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={exportPresentation}
              disabled={isExporting || slides.length === 0}
            >
              {isExporting ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              {isExporting ? "套用範本中…" : "套用公司範本並匯出"}
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            {slides.length} 張投影片
          </Badge>
          <Badge variant="outline" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            2026_ppt_template_16.9.pptx
          </Badge>
          <Badge variant="outline">16:9</Badge>
        </div>

        {exportError ? (
          <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {exportError}
          </p>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {slides.map((slide, index) => (
          <SlideCard
            key={`${slide.slide_number}-${index}`}
            slide={slide}
            index={index}
            onUpdate={onUpdateSlide}
            onRemove={onRemoveSlide}
          />
        ))}
      </div>

      {slides.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">目前沒有可編輯的投影片內容。</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <List className="h-3.5 w-3.5" />
          文字與項目符號會套用範本字型
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mic className="h-3.5 w-3.5" />
          講者備注保留在內容資料中
        </span>
      </div>
    </section>
  );
}
