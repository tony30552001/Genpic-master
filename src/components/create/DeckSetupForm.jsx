import { useRef, useState } from "react";
import { AlertCircle, FileText, Minus, Plus, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_ACCEPT } from "@/lib/documentFormats";
import DeckImageDensityPicker from "./DeckImageDensityPicker";
import DeckRecipePicker from "./DeckRecipePicker";
import DeckSetupSection from "./DeckSetupSection";
import PptTemplatePicker from "./PptTemplatePicker";
import { describeImageDensity, describeLayout, describeStyle } from "./pptTemplateCopy";
import { describeRecipe } from "./pptRecipeCopy";

export const MIN_SLIDES = 4;
export const MAX_SLIDES = 20;
/** 與 api/deck-jobs 的 BRIEF_MAX_LENGTH 一致：超過的部分伺服器會截掉。 */
const BRIEF_MAX_LENGTH = 200;

const clampSlideCount = (value) =>
  Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, Number(value) || MIN_SLIDES));

/**
 * 「設計簡報」的設定流程：內容 → 規格 → 設計三步，每一步都可收合。
 *
 * 受控元件：所有欄位放在單一 `value`，變更以 patch 形式回拋，
 * 讓 PptMasterStudio 只需保管一份可直接送交 generate 的設定。
 */
export default function DeckSetupForm({
  value,
  onChange,
  templates,
  templatesError,
  disabled,
}) {
  const [openStep, setOpenStep] = useState({ content: true, spec: true, design: true });
  const fileInputRef = useRef(null);

  const toggleStep = (id) =>
    setOpenStep((current) => ({ ...current, [id]: !current[id] }));

  const topic = value.topic.trim();
  const density = describeImageDensity(value.imageDensity);
  const selectedStyle = templates.styles.find((option) => option.id === value.styleId);
  const selectedLayout = templates.layouts.find((option) => option.id === value.layoutId);
  const briefCount = [value.briefPurpose, value.briefAudience, value.briefOutcome].filter(
    (field) => field.trim().length > 0
  ).length;
  const templatesReady = templates.styles.length > 0 || templates.layouts.length > 0;

  /**
   * 配方帶來的是建議值，不是鎖：預填頁數、配圖密度與設計風格之後，
   * 三者仍可個別調整。預選風格只有在該風格確實存在於範本清單時才套用。
   */
  const handleRecipeChange = (nextRecipeId) => {
    const next = describeRecipe(nextRecipeId);
    const patch = { recipeId: nextRecipeId };
    if (next.defaultSlideCount) patch.slideCount = next.defaultSlideCount;
    if (next.defaultImageDensity) patch.imageDensity = next.defaultImageDensity;
    if (
      next.preferredStyleId &&
      templates.styles.some((option) => option.id === next.preferredStyleId)
    ) {
      patch.styleId = next.preferredStyleId;
    }
    onChange(patch);
  };

  const clearFile = () => {
    onChange({ file: null });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-3">
      <DeckSetupSection
        step={1}
        title="簡報內容"
        hint="要講什麼、依什麼素材講"
        complete={topic.length >= 4 || Boolean(value.file)}
        summary={topic || value.file?.name || "尚未填寫主題"}
        open={openStep.content}
        onToggle={() => toggleStep("content")}
      >
        <div className="space-y-2">
          <Label htmlFor="deck-topic">簡報主題</Label>
          <Textarea
            id="deck-topic"
            name="deck-topic"
            autoComplete="off"
            value={value.topic}
            onChange={(event) => onChange({ topic: event.target.value })}
            placeholder="例如：2025 年生成式 AI 在製造業的導入策略與投資評估"
            className="min-h-24 resize-y"
            maxLength={2000}
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            只填主題即可從 0 到 1 產生簡報；若同時上傳文件，AI 會以文件內容為依據。
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="deck-source">參考文件（選填）</Label>
          <input
            ref={fileInputRef}
            id="deck-source"
            type="file"
            className="hidden"
            accept={DOCUMENT_ACCEPT}
            onChange={(event) => onChange({ file: event.target.files?.[0] || null })}
          />
          {value.file ? (
            <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm">{value.file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={clearFile}
                disabled={disabled}
                aria-label="移除參考文件"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="w-full justify-start"
            >
              <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
              選擇 PDF、Word、PowerPoint 或文字檔
            </Button>
          )}
        </div>

        <DeckRecipePicker
          value={value.recipeId}
          onChange={handleRecipeChange}
          disabled={disabled}
        />
      </DeckSetupSection>

      <DeckSetupSection
        step={2}
        title="簡報規格"
        hint="份量、配圖與說服對象"
        complete
        summary={`${value.slideCount} 頁 · ${density.name}${
          briefCount > 0 ? ` · 已填 ${briefCount} 項任務` : ""
        }`}
        open={openStep.spec}
        onToggle={() => toggleStep("spec")}
      >
        <div className="space-y-2">
          <Label htmlFor="deck-slide-count">投影片頁數</Label>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => onChange({ slideCount: clampSlideCount(value.slideCount - 1) })}
                disabled={disabled || value.slideCount <= MIN_SLIDES}
                aria-label="減少一頁"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Input
                id="deck-slide-count"
                name="deck-slide-count"
                type="number"
                inputMode="numeric"
                min={MIN_SLIDES}
                max={MAX_SLIDES}
                value={value.slideCount}
                onChange={(event) =>
                  onChange({ slideCount: clampSlideCount(event.target.value) })
                }
                disabled={disabled}
                className="w-16 text-center tabular-nums"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0"
                onClick={() => onChange({ slideCount: clampSlideCount(value.slideCount + 1) })}
                disabled={disabled || value.slideCount >= MAX_SLIDES}
                aria-label="增加一頁"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <p className="min-w-0 text-xs text-muted-foreground">
              可設定 {MIN_SLIDES}–{MAX_SLIDES} 頁，含封面與結尾。
            </p>
          </div>
        </div>

        <DeckImageDensityPicker
          value={value.imageDensity}
          onChange={(imageDensity) => onChange({ imageDensity })}
          disabled={disabled}
        />

        {/* 目的、聽眾與期望成果會直接影響大綱取捨與設計系統的語氣。 */}
        <fieldset disabled={disabled} className="space-y-2 disabled:opacity-60">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <legend className="text-sm font-medium text-foreground">簡報任務（選填）</legend>
            <span className="text-xs text-muted-foreground">
              填得越具體，AI 越知道該講深哪些、該刪掉哪些
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="deck-brief-purpose" className="text-xs font-normal">
                簡報目的
              </Label>
              <Input
                id="deck-brief-purpose"
                name="deck-brief-purpose"
                autoComplete="off"
                value={value.briefPurpose}
                onChange={(event) => onChange({ briefPurpose: event.target.value })}
                placeholder="例如：爭取下一年度預算"
                maxLength={BRIEF_MAX_LENGTH}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="deck-brief-audience" className="text-xs font-normal">
                聽眾對象
              </Label>
              <Input
                id="deck-brief-audience"
                name="deck-brief-audience"
                autoComplete="off"
                value={value.briefAudience}
                onChange={(event) => onChange({ briefAudience: event.target.value })}
                placeholder="例如：財務長與事業處主管"
                maxLength={BRIEF_MAX_LENGTH}
              />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="deck-brief-outcome" className="text-xs font-normal">
                期望成果
              </Label>
              <Input
                id="deck-brief-outcome"
                name="deck-brief-outcome"
                autoComplete="off"
                value={value.briefOutcome}
                onChange={(event) => onChange({ briefOutcome: event.target.value })}
                placeholder="例如：當場核准立項"
                maxLength={BRIEF_MAX_LENGTH}
              />
            </div>
          </div>
        </fieldset>
      </DeckSetupSection>

      <DeckSetupSection
        step={3}
        title="設計外觀"
        hint="選好會即時反映在右側藍圖"
        complete
        summary={`${selectedStyle ? describeStyle(selectedStyle).name : "風格由 AI 決定"} · ${
          selectedLayout ? describeLayout(selectedLayout).name : "骨架由 AI 決定"
        }`}
        open={openStep.design}
        onToggle={() => toggleStep("design")}
      >
        {templatesError ? (
          <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
            <span className="min-w-0 text-sm">{templatesError}</span>
          </div>
        ) : templatesReady ? (
          <PptTemplatePicker
            templates={templates}
            styleId={value.styleId}
            layoutId={value.layoutId}
            onStyleChange={(styleId) => onChange({ styleId })}
            onLayoutChange={(layoutId) => onChange({ layoutId })}
            disabled={disabled}
          />
        ) : (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-sm text-muted-foreground">設計範本載入中…</p>
            <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          </div>
        )}
      </DeckSetupSection>
    </div>
  );
}
