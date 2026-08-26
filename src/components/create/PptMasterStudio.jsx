import { useRef, useState } from "react";
import {
  AlertCircle,
  Download,
  FileText,
  Presentation,
  RotateCcw,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DOCUMENT_ACCEPT } from "@/lib/documentFormats";
import usePptMasterDeck from "@/hooks/usePptMasterDeck";
import DeckProgress from "./DeckProgress";
import DeckImageDensityPicker from "./DeckImageDensityPicker";
import DeckRecipePicker from "./DeckRecipePicker";
import DeckSetupSummary from "./DeckSetupSummary";
import DeckSlideRail from "./DeckSlideRail";
import DeckTimeline from "./DeckTimeline";
import PptTemplatePicker from "./PptTemplatePicker";
import { authoringSlideNumber } from "./deckSteps";
import { describeImageDensity, describeLayout, describeStyle } from "./pptTemplateCopy";
import { DEFAULT_RECIPE_ID, describeRecipe } from "./pptRecipeCopy";

const MIN_SLIDES = 4;
const MAX_SLIDES = 20;
/** 與 api/deck-jobs 的 BRIEF_MAX_LENGTH 一致：超過的部分伺服器會截掉。 */
const BRIEF_MAX_LENGTH = 200;

/**
 * 「設計簡報」子頁籤：以 ppt-master 的設計語彙，從主題或文件一次產出完整 PPTX。
 */
export default function PptMasterStudio() {
  const [topic, setTopic] = useState("");
  const [file, setFile] = useState(null);
  const [slideCount, setSlideCount] = useState(8);
  const [imageDensity, setImageDensity] = useState("key");
  const [styleId, setStyleId] = useState(null);
  const [layoutId, setLayoutId] = useState(null);
  const [recipeId, setRecipeId] = useState(DEFAULT_RECIPE_ID);
  const [briefPurpose, setBriefPurpose] = useState("");
  const [briefAudience, setBriefAudience] = useState("");
  const [briefOutcome, setBriefOutcome] = useState("");
  const [downloadError, setDownloadError] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);
  const fileInputRef = useRef(null);

  const {
    templates,
    templatesError,
    isGenerating,
    progress,
    events,
    slides,
    slidePreviews,
    deck,
    error,
    generate,
    stopWatching,
    download,
    reset,
  } = usePptMasterDeck();

  const canGenerate = Boolean(file) || topic.trim().length >= 4;

  /** 設定已定案（生成中或已產出）時收合，把版位讓給進度與結果。 */
  const isSetupLocked = isGenerating || Boolean(deck);
  const selectedStyle = templates.styles.find((option) => option.id === styleId);
  const selectedLayout = templates.layouts.find((option) => option.id === layoutId);
  const setupTitle = topic.trim() || file?.name || "尚未填寫主題";
  const recipe = describeRecipe(recipeId);
  const setupMeta = [
    recipeId === DEFAULT_RECIPE_ID ? null : recipe.name,
    `${slideCount} 頁`,
    describeImageDensity(imageDensity).name,
    selectedStyle ? describeStyle(selectedStyle).name : "預設風格",
    selectedLayout ? describeLayout(selectedLayout).name : "預設骨架",
    file && topic.trim() ? `參考文件：${file.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  /**
   * 配方帶來的是建議值，不是鎖：預填頁數、配圖密度與設計風格之後，
   * 三者仍可個別調整。預選風格只有在該風格確實存在於範本清單時才套用。
   */
  const handleRecipeChange = (nextRecipeId) => {
    setRecipeId(nextRecipeId);
    const next = describeRecipe(nextRecipeId);
    if (next.defaultSlideCount) setSlideCount(next.defaultSlideCount);
    if (next.defaultImageDensity) setImageDensity(next.defaultImageDensity);
    if (
      next.preferredStyleId &&
      templates.styles.some((option) => option.id === next.preferredStyleId)
    ) {
      setStyleId(next.preferredStyleId);
    }
  };

  const handleGenerate = async () => {
    setDownloadError(null);
    setShowSetup(false);
    setSelectedSlide(null);
    try {
      await generate({
        topic,
        file,
        slideCount,
        imageDensity,
        styleId,
        layoutId,
        recipeId,
        briefPurpose,
        briefAudience,
        briefOutcome,
      });
    } catch (generationError) {
      if (generationError?.name !== "AbortError") {
        console.error("Deck generation failed:", generationError);
      }
    }
  };

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      await download();
    } catch (downloadFailure) {
      setDownloadError(downloadFailure.message || "簡報下載失敗，請稍後重試。");
    }
  };

  const handleStartOver = () => {
    reset();
    setDownloadError(null);
    setShowSetup(false);
    setSelectedSlide(null);
  };

  const setupCards = (
    <>
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <DeckRecipePicker
            value={recipeId}
            onChange={handleRecipeChange}
            disabled={isGenerating}
          />

          <div className="space-y-2">
            <Label htmlFor="deck-topic">簡報主題</Label>
            <Textarea
              id="deck-topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="例如：2025 年生成式 AI 在製造業的導入策略與投資評估"
              className="min-h-24 resize-y"
              maxLength={2000}
              disabled={isGenerating}
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
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
            {file ? (
              <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  disabled={isGenerating}
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
                disabled={isGenerating}
                className="w-full justify-start"
              >
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                選擇 PDF、Word、PowerPoint 或文字檔
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="deck-slide-count">投影片頁數</Label>
            <Input
              id="deck-slide-count"
              type="number"
              min={MIN_SLIDES}
              max={MAX_SLIDES}
              value={slideCount}
              onChange={(event) =>
                setSlideCount(
                  Math.min(
                    MAX_SLIDES,
                    Math.max(MIN_SLIDES, Number(event.target.value) || MIN_SLIDES)
                  )
                )
              }
              disabled={isGenerating}
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              可設定 {MIN_SLIDES}–{MAX_SLIDES} 頁，含封面與結尾。
            </p>
          </div>

          <DeckImageDensityPicker
            value={imageDensity}
            onChange={setImageDensity}
            disabled={isGenerating}
          />

          {/* 目的、聽眾與期望成果會直接影響大綱取捨與設計系統的語氣。 */}
          <fieldset disabled={isGenerating} className="space-y-2 disabled:opacity-60">
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
                  value={briefPurpose}
                  onChange={(event) => setBriefPurpose(event.target.value)}
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
                  value={briefAudience}
                  onChange={(event) => setBriefAudience(event.target.value)}
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
                  value={briefOutcome}
                  onChange={(event) => setBriefOutcome(event.target.value)}
                  placeholder="例如：當場核准立項"
                  maxLength={BRIEF_MAX_LENGTH}
                />
              </div>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          {templatesError ? (
            <div className="flex items-center gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 text-sm">{templatesError}</span>
            </div>
          ) : (
            <PptTemplatePicker
              templates={templates}
              styleId={styleId}
              layoutId={layoutId}
              onStyleChange={setStyleId}
              onLayoutChange={setLayoutId}
              disabled={isGenerating}
            />
          )}
        </CardContent>
      </Card>
    </>
  );

  const railTotal = Math.max(progress.total || 0, slides.length, deck?.slideCount || 0);
  const showRail = railTotal > 0 && (isGenerating || slides.length > 0);
  const activeSlide = authoringSlideNumber(events);
  const selectedPreview = selectedSlide ? slidePreviews[selectedSlide] : null;

  return (
    <div className="mx-auto w-full max-w-6xl pb-6 lg:grid lg:grid-cols-5 lg:items-start lg:gap-4">
      <div className="space-y-4 lg:col-span-3">
        {isSetupLocked ? (
          <DeckSetupSummary
            title={setupTitle}
            meta={setupMeta}
            expanded={showSetup}
            onToggle={() => setShowSetup((current) => !current)}
          >
            {setupCards}
          </DeckSetupSummary>
        ) : (
          setupCards
        )}

        {isGenerating && (
          <DeckProgress
            phase={progress.phase}
            current={progress.current}
            total={progress.total}
            startedAt={progress.startedAt}
            events={events}
          />
        )}

        {selectedPreview && (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium">
                第 {selectedSlide} 頁
                {selectedPreview.title ? `：${selectedPreview.title}` : ""}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setSelectedSlide(null)}
                aria-label="關閉放大預覽"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <img
              src={selectedPreview.url}
              alt={`第 ${selectedSlide} 頁預覽`}
              className="w-full rounded border border-border bg-background"
            />
          </div>
        )}

        {error && (
          <div className="space-y-3 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <span className="min-w-0 text-sm text-foreground">{error}</span>
            </div>
            {!isGenerating && events.length > 0 && <DeckTimeline events={events} />}
          </div>
        )}

        {downloadError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2.5">
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <span className="min-w-0 text-sm text-foreground">{downloadError}</span>
          </div>
        )}

        {deck && !isGenerating ? (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-6">
              <Presentation className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{deck.title}</p>
                <p className="text-xs text-muted-foreground">
                  共 {deck.slideCount} 頁，已是可直接編輯的原生 PowerPoint 投影片。
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" variant="outline" onClick={handleStartOver}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  重新產生
                </Button>
                <Button type="button" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  下載 PPTX
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="flex justify-end gap-2">
            {isGenerating && (
              <Button
                type="button"
                variant="outline"
                onClick={stopWatching}
                aria-label="停止追蹤這份簡報；雲端上的生成不會因此中止"
              >
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                停止追蹤
              </Button>
            )}
            <Button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
            >
              <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
              產生簡報
            </Button>
          </div>
        )}
      </div>

      {showRail && (
        <div className="mt-4 lg:col-span-2 lg:mt-0">
          <div className="lg:sticky lg:top-4">
            <DeckSlideRail
              total={railTotal}
              slides={slides}
              previews={slidePreviews}
              activeSlideNumber={activeSlide}
              selectedSlideNumber={selectedSlide}
              onSelect={setSelectedSlide}
            />
          </div>
        </div>
      )}
    </div>
  );
}
