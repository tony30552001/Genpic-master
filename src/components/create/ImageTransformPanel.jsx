import React, { useEffect, useRef, useState } from "react";
import {
  Upload,
  X,
  Download,
  ChevronDown,
  ChevronUp,
} from "@/components/icons/lucideControls";
import {
  Loader2,
  Check,
} from "@/components/icons/lucideStatus";
import {
  Palette,
  Sparkles,
} from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getImageOutputLabel } from "@/lib/imageOutput";
import { cn } from "@/lib/utils";
import { optimizePrompt } from "@/services/aiService";
import StylePalette from "./StylePalette";
import { STYLE_DIMENSIONS } from "./styleDimensions";
import PromptTemplates from "./PromptTemplates";
import PromptSuggestionPanel from "./PromptSuggestionPanel";
import ImageGeneratingState from "./ImageGeneratingState";

const TRANSFORM_MODES = [
  {
    id: "style_transfer",
    label: "風格轉換",
    description: "保留內容，套用新畫風（水彩、動漫、油畫…）",
    placeholder: "描述想要的畫風，例如：日式水彩插畫風格，柔和色調",
  },
  {
    id: "reference_gen",
    label: "以圖生圖",
    description: "以上傳圖為參考，依描述生成全新圖片",
    placeholder: "描述想生成的新圖片，例如：同樣的場景，但改為冬天雪景",
  },
  {
    id: "element_extract",
    label: "元素提取",
    description: "提取主體元素，放入新場景或構圖中",
    placeholder: "描述新場景，例如：將角色放置在宇宙星空的背景中",
  },
  {
    id: "bg_replace",
    label: "背景替換",
    description: "保留前景主體，替換背景",
    placeholder: "描述新背景，例如：換成日落海邊，橙紅色天空",
  },
];

const ASPECT_RATIO_DIMENSIONS = {
  "1:1": { width: 1200, height: 1200 },
  "16:9": { width: 1600, height: 900 },
  "9:16": { width: 900, height: 1600 },
  "4:3": { width: 1200, height: 900 },
  "3:4": { width: 900, height: 1200 },
  "3:2": { width: 1500, height: 1000 },
  "2:3": { width: 1000, height: 1500 },
  "5:4": { width: 1250, height: 1000 },
  "4:5": { width: 1000, height: 1250 },
  "21:9": { width: 2100, height: 900 },
};

const getAspectRatioValue = (value) => value?.replace(":", " / ") || "1 / 1";

/** Shared result content (used in both desktop card and mobile section) */
function ResultContent({
  isTransforming,
  result,
  aspectRatio,
  promptSummary,
  onDownloadResult,
}) {
  const dimensions = ASPECT_RATIO_DIMENSIONS[aspectRatio] || ASPECT_RATIO_DIMENSIONS["1:1"];

  if (isTransforming) {
    return (
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-xl"
        style={{ aspectRatio: getAspectRatioValue(aspectRatio) }}
      >
        <ImageGeneratingState
          aspectRatio={aspectRatio}
          generationStatus={{ label: "AI 正在轉換圖片" }}
          promptSummary={promptSummary}
          resolutionLabel={getImageOutputLabel({ aspectRatio })}
          compact
        />
      </div>
    );
  }
  if (result) {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <img
          src={result}
          alt="AI 轉換結果"
          width={dimensions.width}
          height={dimensions.height}
          decoding="async"
          className="w-full h-auto max-h-[65vh] object-contain rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-500"
        />
        <button
          type="button"
          onClick={onDownloadResult}
          className="flex items-center gap-1.5 text-sm font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-4 py-2 rounded-lg transition-colors shadow-md border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="icon-sm shrink-0" />
          下載圖片
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center px-4">
      <ProductGlyph kind="transform" className="h-14 w-14 text-primary/60" aria-hidden="true" />
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">轉換結果會在這裡顯示</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          上傳來源圖片，選擇轉換模式並描述效果，點擊「開始 AI 轉換」即可生成。
        </p>
      </div>
    </div>
  );
}

function BeforeAfterPreview({
  sourcePreview,
  isTransforming,
  result,
  aspectRatio,
  promptSummary,
  onDownloadResult,
}) {
  if (!sourcePreview) {
    return (
      <ResultContent
        isTransforming={isTransforming}
        result={result}
        aspectRatio={aspectRatio}
        promptSummary={promptSummary}
        onDownloadResult={onDownloadResult}
      />
    );
  }

  const sourceDimensions = ASPECT_RATIO_DIMENSIONS["4:3"];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Before / After</h2>
        <span className="text-xs text-muted-foreground">來源與結果對照</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0 rounded-xl border border-border bg-background/70 p-2">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Before · 原圖</p>
          <div
            className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-muted/40"
            style={{ aspectRatio: getAspectRatioValue(aspectRatio) }}
          >
            <img
              src={sourcePreview}
              alt="轉換前的來源圖片"
              width={sourceDimensions.width}
              height={sourceDimensions.height}
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-primary/20 bg-primary/[0.03] p-2">
          <p className="mb-2 text-xs font-medium text-primary">After · 轉換後</p>
          <ResultContent
            isTransforming={isTransforming}
            result={result}
            aspectRatio={aspectRatio}
            promptSummary={promptSummary}
            onDownloadResult={onDownloadResult}
          />
        </div>
      </div>
    </div>
  );
}

export default function ImageTransformPanel({
  // Source image
  sourcePreview,
  isUploadingSource,
  sourceUploadProgress,
  onSourceImageUpload,
  onClearSource,

  // Settings
  mode,
  onModeChange,
  prompt,
  onPromptChange,
  aspectRatio,

  // Style palette
  paletteSelected,
  onPaletteSelectedChange,

  // Style library
  savedStyles = [],
  appliedStyleName,
  appliedStyleId,
  onApplyStyle,
  onClearAppliedStyle,

  // Global model (read-only, from Settings)
  imageLanguage = "",

  // Result
  result,
  isTransforming,
  transformError,
  onDownloadResult,
}) {
  const fileInputRef = useRef(null);
  const resultRef = useRef(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [showStyleSource, setShowStyleSource] = useState(false);
  const [styleSourceTab, setStyleSourceTab] = useState("templates");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [suggestionData, setSuggestionData] = useState(null);
  const activeModeInfo = TRANSFORM_MODES.find((m) => m.id === mode) || TRANSFORM_MODES[0];
  const selectedPaletteCount = STYLE_DIMENSIONS.reduce(
    (total, dimension) => total + (paletteSelected?.[dimension.id]?.length || 0),
    0
  );

  useEffect(() => {
    if (
      !result
      || isTransforming
      || !resultRef.current
      || typeof resultRef.current.scrollIntoView !== "function"
      || !window.matchMedia?.("(max-width: 1023px)")?.matches
    ) return;
    const prefersReducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;
    resultRef.current.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  }, [result, isTransforming]);

  const handleSmartOptimize = async () => {
    if (!prompt?.trim()) return;
    setIsOptimizing(true);
    setOptimizeError("");
    setSuggestionData(null);
    try {
      const paletteTagsStr = STYLE_DIMENSIONS
        .flatMap((d) => paletteSelected?.[d.id] || [])
        .join("，");
      const styleContext = [activeModeInfo.label, paletteTagsStr, appliedStyleName]
        .filter(Boolean)
        .join("，");
      const result = await optimizePrompt({ userScript: prompt, styleContext, imageLanguage });
      if (result && (result.optimizedPromptZh || result.optimizedPrompt)) {
        setSuggestionData({
          originalText: prompt,
          optimizedText: result.optimizedPromptZh || result.optimizedPrompt,
          explanation: result.explanation || "",
        });
      } else {
        setOptimizeError("AI 未回傳可用的優化內容，請稍後再試。");
      }
    } catch (err) {
      console.error("Transform prompt optimize failed:", err);
      setOptimizeError(err?.message || "優化失敗，請稍後再試。");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleTemplateFill = (text, palette) => {
    onPromptChange(text);
    if (palette) onPaletteSelectedChange(palette);
    setShowStyleSource(true);
    setStyleSourceTab("templates");
  };

  const handlePaletteChange = (nextSelected) => {
    onPaletteSelectedChange(nextSelected);
    setShowStyleSource(true);
    setStyleSourceTab("palette");
  };

  const handleApplySavedStyle = (style) => {
    onApplyStyle(style);
    setShowStylePicker(false);
    setShowStyleSource(true);
    setStyleSourceTab("saved");
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) {
      onSourceImageUpload(file);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onSourceImageUpload(file);
    e.target.value = "";
  };

  return (
    /* Mirror general creation outer wrapper */
    <div className="h-full min-h-0 flex flex-col bg-muted/25 overflow-y-auto lg:overflow-hidden custom-scrollbar">

      {/* Error Message (top, full-width) */}
      {transformError && (
        <div className="shrink-0 px-4 lg:px-8 pt-3">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
            {transformError}
          </div>
        </div>
      )}

      {/* ─── Main content: 3/5 controls + 2/5 result (mirrors general creation) ─── */}
      <div className="flex-1 min-h-0 flex flex-col gap-4 lg:grid lg:grid-cols-5 lg:gap-6 px-4 py-3 lg:px-8">

        {/* ─── Left: Controls (col-span-3) ─── */}
        <div className="lg:col-span-3 min-h-0 lg:overflow-y-auto lg:custom-scrollbar pl-px pr-1">
          <div className="space-y-5 pb-4">

          {/* Source image */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">來源圖片</h2>
              {sourcePreview && (
                <span className="text-xs text-primary">已準備就緒</span>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="sr-only"
              tabIndex={-1}
              aria-label="選擇來源圖片"
            />

            {sourcePreview ? (
              <div
                className="relative rounded-xl border border-primary/30 bg-primary/[0.04] p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/50 sm:h-36 sm:w-36">
                    <img
                      src={sourcePreview}
                      alt="來源圖片預覽"
                      width={640}
                      height={480}
                      decoding="async"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div>
                      <p className="truncate text-sm font-medium text-foreground">來源圖片已上傳</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        可拖曳新圖片覆蓋，或使用下方按鈕管理。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="min-h-11 touch-manipulation rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Upload className="mr-1.5 inline-block icon-sm" aria-hidden="true" />
                        更換圖片
                      </button>
                      <button
                        type="button"
                        onClick={onClearSource}
                        className="min-h-11 touch-manipulation rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <X className="mr-1.5 inline-block icon-sm" aria-hidden="true" />
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="flex min-h-44 w-full touch-manipulation flex-col items-center justify-center rounded-xl border-2 border-dashed border-border px-4 py-8 text-center text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Upload className="mb-2 icon-display" aria-hidden="true" />
                <span className="text-sm font-medium">點擊上傳或拖曳圖片</span>
                <span className="mt-1 text-xs text-muted-foreground/70">支援 JPG、PNG（最大 10MB）</span>
              </button>
            )}

            {isUploadingSource && (
              <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                    style={{ width: `${sourceUploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">上傳中… {sourceUploadProgress}%</p>
              </div>
            )}
          </section>

          {/* Transform mode and prompt */}
          <section className="space-y-4 rounded-2xl border border-border bg-card/70 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-foreground">轉換指令</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  先選擇轉換方式，再描述希望 AI 產生的效果。
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {activeModeInfo.label}
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">轉換模式</p>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFORM_MODES.map((m) => {
                  const isActive = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onModeChange(m.id)}
                      aria-pressed={isActive}
                      className={cn(
                        "flex min-h-11 touch-manipulation flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-[background-color,border-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive
                          ? "border-primary bg-primary/8 text-foreground shadow-sm"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-muted/30"
                      )}
                    >
                      <span className={cn("flex w-full items-center gap-1.5", isActive && "text-primary")}>
                        <span className="text-xs font-semibold">{m.label}</span>
                        {isActive && <Check className="icon-sm ml-auto" aria-hidden="true" />}
                      </span>
                      <span className="hidden text-xs leading-snug text-muted-foreground sm:line-clamp-2 sm:block">
                        {m.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <label htmlFor="transform-prompt" className="text-xs font-medium text-foreground">
                  描述轉換效果
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleSmartOptimize}
                  disabled={isOptimizing || !prompt?.trim()}
                  className="min-h-11 w-full shrink-0 touch-manipulation gap-1.5 rounded-lg border-primary/30 bg-background px-4 text-xs font-semibold text-primary shadow-sm hover:bg-primary/10 sm:h-8 sm:min-h-0 sm:w-auto"
                  title="使用 AI 自動豐富描述細節與提示詞"
                >
                  {isOptimizing ? (
                    <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  ) : (
                    <Sparkles className="icon-sm" aria-hidden="true" />
                  )}
                  {isOptimizing ? "優化中…" : "AI 智能優化"}
                </Button>
              </div>
              {optimizeError && (
                <div
                  id="transform-prompt-error"
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive"
                >
                  {optimizeError}
                </div>
              )}
              <Textarea
                id="transform-prompt"
                name="transformPrompt"
                value={prompt}
                onChange={(e) => {
                  onPromptChange(e.target.value);
                  setSuggestionData(null);
                  setOptimizeError("");
                }}
                placeholder={activeModeInfo.placeholder}
                rows={3}
                aria-describedby={optimizeError ? "transform-prompt-error" : undefined}
                className="min-h-28 resize-none text-sm leading-relaxed"
              />
              {suggestionData && (
                <PromptSuggestionPanel
                  originalText={suggestionData.originalText}
                  optimizedText={suggestionData.optimizedText}
                  explanation={suggestionData.explanation}
                  onAccept={() => {
                    onPromptChange(suggestionData.optimizedText);
                    setSuggestionData(null);
                  }}
                  onReject={() => setSuggestionData(null)}
                />
              )}
            </div>
          </section>

          {/* Style source tabs */}
          <section className="overflow-hidden rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setShowStyleSource((open) => !open)}
              className="flex min-h-11 w-full touch-manipulation items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-expanded={showStyleSource}
              aria-controls="style-source-content"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">風格來源</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {appliedStyleName
                    ? `我的風格：${appliedStyleName}`
                    : selectedPaletteCount > 0
                      ? `調色盤已選 ${selectedPaletteCount} 個標籤`
                      : "範本、調色盤、我的風格"}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {selectedPaletteCount > 0 && (
                  <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary sm:inline-flex">
                    {selectedPaletteCount} 個標籤
                  </span>
                )}
                {showStyleSource ? (
                  <ChevronUp className="icon-sm text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronDown className="icon-sm text-muted-foreground" aria-hidden="true" />
                )}
              </span>
            </button>

            <div
              id="style-source-content"
              aria-hidden={!showStyleSource}
              inert={!showStyleSource}
              className={cn(
                "grid overflow-hidden border-t border-border transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
                showStyleSource
                  ? "grid-rows-[1fr] opacity-100"
                  : "pointer-events-none grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="space-y-3 p-3 sm:p-4">
                  <div
                    role="tablist"
                    aria-label="風格來源類型"
                    className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1"
                  >
                    {[
                      { id: "templates", label: "範本" },
                      { id: "palette", label: "調色盤" },
                      { id: "saved", label: "我的風格" },
                    ].map(({ id, label }) => {
                      const isActive = styleSourceTab === id;
                      return (
                        <button
                          key={id}
                          id={`style-source-tab-${id}`}
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          aria-controls={`style-source-panel-${id}`}
                          onClick={() => setStyleSourceTab(id)}
                          className={cn(
                            "flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-semibold transition-[background-color,box-shadow,color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive
                              ? "bg-background text-primary shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {styleSourceTab === "templates" && (
                    <div
                      id="style-source-panel-templates"
                      role="tabpanel"
                      aria-labelledby="style-source-tab-templates"
                      tabIndex={0}
                    >
                      <PromptTemplates collapsible={false} onFill={handleTemplateFill} />
                    </div>
                  )}

                  {styleSourceTab === "palette" && (
                    <div
                      id="style-source-panel-palette"
                      role="tabpanel"
                      aria-labelledby="style-source-tab-palette"
                      tabIndex={0}
                    >
                      <StylePalette
                        collapsible={false}
                        selected={paletteSelected}
                        onSelectedChange={handlePaletteChange}
                      />
                    </div>
                  )}

                  {styleSourceTab === "saved" && (
                    <div
                      id="style-source-panel-saved"
                      role="tabpanel"
                      aria-labelledby="style-source-tab-saved"
                      tabIndex={0}
                      className="space-y-2"
                    >
                      {appliedStyleName ? (
                        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                          <Check className="icon-sm shrink-0 text-primary" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
                            {appliedStyleName}
                          </span>
                          <button
                            type="button"
                            onClick={onClearAppliedStyle}
                            className="min-h-11 min-w-11 touch-manipulation rounded-lg text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="取消套用風格"
                          >
                            <X className="mx-auto icon-sm" aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setShowStylePicker((open) => !open)}
                            className="flex min-h-11 w-full touch-manipulation items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={showStylePicker}
                            aria-controls="saved-style-list"
                          >
                            <Palette className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
                            <span className="flex-1 text-xs font-medium text-foreground">選擇已儲存的風格</span>
                            {showStylePicker ? (
                              <ChevronUp className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="icon-sm shrink-0 text-muted-foreground" aria-hidden="true" />
                            )}
                          </button>

                          {showStylePicker && (
                            <div
                              id="saved-style-list"
                              className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card custom-scrollbar"
                            >
                              {savedStyles.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                  尚無已儲存的風格
                                </p>
                              ) : (
                                savedStyles.map((style) => (
                                  <button
                                    key={style.id}
                                    type="button"
                                    onClick={() => handleApplySavedStyle(style)}
                                    className={cn(
                                      "flex min-h-11 w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                      appliedStyleId === style.id && "bg-primary/5"
                                    )}
                                  >
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate font-semibold text-foreground">{style.name}</span>
                                      {style.description && (
                                        <span className="mt-0.5 block line-clamp-1 text-muted-foreground">
                                          {style.description}
                                        </span>
                                      )}
                                    </span>
                                    {appliedStyleId === style.id && (
                                      <Check className="mt-0.5 icon-sm shrink-0 text-primary" aria-hidden="true" />
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Mobile result — result state scrolls into view after generation */}
        <div
          ref={resultRef}
          id="transform-result"
          className="scroll-mt-4 lg:hidden mt-2 mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40"
        >
          <ResultContent
            isTransforming={isTransforming}
            result={result}
            aspectRatio={aspectRatio}
            promptSummary={prompt || activeModeInfo.description}
            onDownloadResult={onDownloadResult}
          />
        </div>
      </div>

        {/* Desktop before / after preview */}
        <div className="lg:col-span-2 min-h-0 hidden lg:flex items-center justify-center relative overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40">
          {/* Decorative dot grid background */}
          <div
            className={`absolute inset-0 bg-muted/35 transition-opacity duration-300 ${isTransforming || result ? 'opacity-0' : 'opacity-100'}`}
            style={{
              backgroundImage: 'linear-gradient(hsl(var(--foreground) / 0.06) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.06) 1px, transparent 1px)',
              backgroundSize: '24px 24px'
            }}
          />
          <div className="relative z-10 w-full h-full flex items-center justify-center p-6">
            <BeforeAfterPreview
              sourcePreview={sourcePreview}
              isTransforming={isTransforming}
              result={result}
              aspectRatio={aspectRatio}
              promptSummary={prompt || activeModeInfo.description}
              onDownloadResult={onDownloadResult}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
