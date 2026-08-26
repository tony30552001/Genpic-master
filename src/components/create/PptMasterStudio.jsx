import { useState } from "react";
import {
  AlertCircle,
  Compass,
  Download,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutTemplate,
  Palette,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import usePptMasterDeck from "@/hooks/usePptMasterDeck";
import DeckBlueprint from "./DeckBlueprint";
import DeckPreviewStage from "./DeckPreviewStage";
import DeckProgress from "./DeckProgress";
import DeckSetupForm from "./DeckSetupForm";
import DeckSetupSummary from "./DeckSetupSummary";
import DeckTimeline from "./DeckTimeline";
import { authoringSlideNumber } from "./deckSteps";
import { describeImageDensity, describeLayout, describeStyle } from "./pptTemplateCopy";
import { DEFAULT_RECIPE_ID, describeRecipe } from "./pptRecipeCopy";

const INITIAL_SETUP = {
  topic: "",
  file: null,
  slideCount: 8,
  imageDensity: "key",
  styleId: null,
  layoutId: null,
  recipeId: DEFAULT_RECIPE_ID,
  briefPurpose: "",
  briefAudience: "",
  briefOutcome: "",
};

/**
 * 把設定收斂成一份可重複使用的摘要：收合列與右側藍圖講的是同一件事，
 * 只是詳略不同，因此在同一個地方推導，避免兩邊各說各話。
 */
const buildSetupDigest = (setup, templates) => {
  const style = templates.styles.find((option) => option.id === setup.styleId);
  const layout = templates.layouts.find((option) => option.id === setup.layoutId);
  const topic = setup.topic.trim();
  const items = [
    { id: "recipe", icon: Compass, label: "簡報用途", value: describeRecipe(setup.recipeId).name },
    { id: "slides", icon: Layers, label: "頁數", value: `${setup.slideCount} 頁` },
    {
      id: "density",
      icon: ImageIcon,
      label: "AI 配圖",
      value: describeImageDensity(setup.imageDensity).name,
    },
    {
      id: "style",
      icon: Palette,
      label: "設計風格",
      value: style ? describeStyle(style).name : "由 AI 決定",
    },
    {
      id: "layout",
      icon: LayoutTemplate,
      label: "版面骨架",
      value: layout ? describeLayout(layout).name : "由 AI 決定",
    },
    setup.file
      ? { id: "file", icon: FileText, label: "參考文件", value: setup.file.name }
      : null,
  ].filter(Boolean);

  return {
    title: topic || setup.file?.name || "尚未填寫主題",
    items,
    styleName: style ? describeStyle(style).name : "",
    meta: items
      .filter((item) => item.id !== "file")
      .map((item) => item.value)
      .join(" · "),
  };
};

/**
 * 「設計簡報」子頁籤：以 ppt-master 的設計語彙，從主題或文件一次產出完整 PPTX。
 *
 * 版面是固定高度的雙欄工作區：左欄走設定動線並自行捲動，右欄常駐「藍圖／預覽」舞台，
 * 操作列與錯誤訊息釘在底部，因此無論表單多長，主要行動與生成狀態都不會捲出視線。
 */
export default function PptMasterStudio() {
  const [setup, setSetup] = useState(INITIAL_SETUP);
  const [downloadError, setDownloadError] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState(null);

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

  const updateSetup = (patch) => setSetup((current) => ({ ...current, ...patch }));

  const canGenerate = Boolean(setup.file) || setup.topic.trim().length >= 4;
  /** 設定已定案（生成中或已產出）時收合，把版位讓給進度與結果。 */
  const isSetupLocked = isGenerating || Boolean(deck);
  const digest = buildSetupDigest(setup, templates);

  const railTotal = Math.max(progress.total || 0, slides.length, deck?.slideCount || 0);
  const showStage = railTotal > 0 && (isGenerating || slides.length > 0);
  const activeSlide = authoringSlideNumber(events);
  const authoredNumbers = Object.keys(slidePreviews)
    .map(Number)
    .filter(Number.isFinite);
  const latestSlide = authoredNumbers.length > 0 ? Math.max(...authoredNumbers) : null;
  const stageSlide = selectedSlide ?? latestSlide;

  const handleGenerate = async () => {
    setDownloadError(null);
    setShowSetup(false);
    setSelectedSlide(null);
    try {
      await generate(setup);
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

  const actionHint = isGenerating
    ? "生成在雲端進行，離開或重新整理都不會中斷。"
    : deck
      ? `共 ${deck.slideCount} 頁，已是可直接編輯的原生 PowerPoint 投影片。`
      : canGenerate
        ? `AI 會逐頁設計 ${setup.slideCount} 頁並通過版面品質檢查，約需 5–15 分鐘。`
        : "請先填寫簡報主題（至少 4 個字）或上傳參考文件。";

  const setupForm = (
    <DeckSetupForm
      value={setup}
      onChange={updateSetup}
      templates={templates}
      templatesError={templatesError}
      disabled={isGenerating}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar lg:overflow-hidden">
        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-4 lg:grid lg:h-full lg:grid-cols-12 lg:gap-6">
          <div
            className={cn(
              "min-w-0 space-y-3 custom-scrollbar lg:min-h-0 lg:overflow-y-auto lg:pb-4 lg:pr-1",
              isSetupLocked ? "lg:col-span-5" : "lg:col-span-7"
            )}
          >
            {isSetupLocked ? (
              <DeckSetupSummary
                title={deck?.title || digest.title}
                meta={digest.meta}
                expanded={showSetup}
                onToggle={() => setShowSetup((current) => !current)}
              >
                {setupForm}
              </DeckSetupSummary>
            ) : (
              setupForm
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

            {error && !isGenerating && events.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-3">
                <p className="mb-2 text-sm font-medium text-foreground">生成歷程</p>
                <DeckTimeline events={events} />
              </div>
            )}
          </div>

          <div
            className={cn(
              "min-w-0 lg:min-h-0 lg:pb-4",
              isSetupLocked ? "lg:col-span-7" : "lg:col-span-5"
            )}
          >
            {showStage ? (
              <DeckPreviewStage
                total={railTotal}
                slides={slides}
                previews={slidePreviews}
                activeSlideNumber={activeSlide}
                stageSlideNumber={stageSlide}
                followingLatest={selectedSlide === null}
                onSelect={setSelectedSlide}
              />
            ) : (
              <DeckBlueprint
                title={digest.title}
                items={digest.items}
                styleId={setup.styleId}
                styleName={digest.styleName}
              />
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-2 pt-3">
        {(error || downloadError) && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/50 bg-destructive/10 px-3 py-2.5"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span className="min-w-0 text-sm text-foreground">{error || downloadError}</span>
          </div>
        )}

        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card/90 px-3 py-2.5 shadow-sm backdrop-blur sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-xs text-muted-foreground">{actionHint}</p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            {isGenerating ? (
              <Button
                type="button"
                variant="outline"
                onClick={stopWatching}
                aria-label="停止追蹤這份簡報；雲端上的生成不會因此中止"
              >
                <X className="mr-2 h-4 w-4" aria-hidden="true" />
                停止追蹤
              </Button>
            ) : deck ? (
              <>
                <Button type="button" variant="outline" onClick={handleStartOver}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  重新產生
                </Button>
                <Button type="button" onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                  下載 PPTX
                </Button>
              </>
            ) : (
              <Button type="button" onClick={handleGenerate} disabled={!canGenerate}>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                產生簡報
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
