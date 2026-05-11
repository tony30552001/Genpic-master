import React, { useRef, useState } from "react";
import {
  Upload, X, Wand2, Loader2, Download,
  Palette, Copy, Scissors, Image as ImageIcon, ChevronDown, ChevronUp, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import StylePalette from "./StylePalette";
import PromptTemplates from "./PromptTemplates";

const TRANSFORM_MODES = [
  {
    id: "style_transfer",
    label: "風格轉換",
    icon: Palette,
    description: "保留內容，套用新畫風（水彩、動漫、油畫…）",
    placeholder: "描述想要的畫風，例如：日式水彩插畫風格，柔和色調",
  },
  {
    id: "reference_gen",
    label: "以圖生圖",
    icon: Copy,
    description: "以上傳圖為參考，依描述生成全新圖片",
    placeholder: "描述想生成的新圖片，例如：同樣的場景，但改為冬天雪景",
  },
  {
    id: "element_extract",
    label: "元素提取",
    icon: Scissors,
    description: "提取主體元素，放入新場景或構圖中",
    placeholder: "描述新場景，例如：將角色放置在宇宙星空的背景中",
  },
  {
    id: "bg_replace",
    label: "背景替換",
    icon: ImageIcon,
    description: "保留前景主體，替換背景",
    placeholder: "描述新背景，例如：換成日落海邊，橙紅色天空",
  },
];

const ASPECT_RATIOS = [
  { id: "1:1",  label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "9:16", label: "9:16" },
  { id: "4:3",  label: "4:3" },
  { id: "3:4",  label: "3:4" },
  { id: "3:2",  label: "3:2" },
  { id: "2:3",  label: "2:3" },
  { id: "5:4",  label: "5:4" },
  { id: "4:5",  label: "4:5" },
  { id: "21:9", label: "21:9" },
];

/** Shared result content (used in both desktop card and mobile section) */
function ResultContent({ isTransforming, result, onDownloadResult }) {
  if (isTransforming) {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <Skeleton className="w-full aspect-square max-w-sm rounded-xl bg-muted/80" />
        <p className="text-sm text-muted-foreground animate-pulse">AI 正在轉換圖片，請稍候…</p>
      </div>
    );
  }
  if (result) {
    return (
      <div className="w-full flex flex-col items-center gap-4">
        <img
          src={result}
          alt="AI 轉換結果"
          className="w-full h-auto max-h-[65vh] object-contain rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-500"
        />
        <button
          type="button"
          onClick={onDownloadResult}
          className="flex items-center gap-1.5 text-sm font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-4 py-2 rounded-lg transition-colors shadow-md border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Download className="w-4 h-4 shrink-0" />
          下載圖片
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 text-center px-4">
      <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center shadow-sm">
        <Wand2 className="w-9 h-9 text-primary/60" />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-semibold text-foreground">轉換結果會在這裡顯示</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          上傳來源圖片，選擇轉換模式並描述效果，點擊「開始 AI 轉換」即可生成。
        </p>
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
  onAspectRatioChange,

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
  globalModelLabel,

  // Result
  result,
  isTransforming,
  transformError,
  onTransform,
  onCancelTransform,
  onDownloadResult,
}) {
  const fileInputRef = useRef(null);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const activeModeInfo = TRANSFORM_MODES.find((m) => m.id === mode) || TRANSFORM_MODES[0];

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
          <div className="space-y-5">

          {/* 1. Source Image Upload */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</span>
              上傳來源圖片
            </h2>

            <div
              className={cn(
                "relative group border-2 border-dashed rounded-xl transition-colors",
                sourcePreview
                  ? "border-primary/40 bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30 cursor-pointer"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => !sourcePreview && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              {sourcePreview ? (
                <div className="relative p-2">
                  <img
                    src={sourcePreview}
                    alt="來源圖片"
                    className="w-full max-h-48 object-contain rounded-lg"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none">
                    <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
                      點擊更換
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onClearSource(); }}
                    className="absolute -top-1 -right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow hover:bg-destructive/10 hover:text-destructive transition-colors"
                    aria-label="移除圖片"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="更換圖片"
                  >
                    <span className="sr-only">更換圖片</span>
                  </button>
                </div>
              ) : (
                <div className="py-10 flex flex-col items-center text-muted-foreground">
                  <Upload className="w-8 h-8 mb-2" />
                  <span className="text-sm font-medium">點擊上傳或拖曳圖片</span>
                  <span className="text-xs mt-1 text-muted-foreground/70">支援 JPG、PNG（最大 10MB）</span>
                </div>
              )}
            </div>

            {/* Upload progress */}
            {isUploadingSource && (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                    style={{ width: `${sourceUploadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">上傳中… {sourceUploadProgress}%</p>
              </div>
            )}
          </section>

          {/* 2. Transform Mode */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</span>
              選擇轉換模式
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {TRANSFORM_MODES.map((m) => {
                const Icon = m.icon;
                const isActive = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onModeChange(m.id)}
                    className={cn(
                      "flex flex-col items-start gap-1.5 p-3 rounded-xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isActive
                        ? "border-primary bg-primary/8 text-foreground shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:bg-muted/30 text-muted-foreground"
                    )}
                  >
                    <div className={cn("flex items-center gap-1.5", isActive && "text-primary")}>
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="text-xs font-semibold">{m.label}</span>
                    </div>
                    <span className="text-[10px] leading-snug text-muted-foreground line-clamp-2">{m.description}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Prompt Templates */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
              風格範本
            </h2>
            <PromptTemplates
              onFill={(text, palette) => {
                onPromptChange(text);
                onPaletteSelectedChange(palette || {});
              }}
            />
          </section>

          {/* 4. Custom Prompt */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</span>
              描述轉換效果
            </h2>
            <Textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder={activeModeInfo.placeholder}
              rows={3}
              className="resize-none text-sm"
            />
          </section>

          {/* 5. Style Palette */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">5</span>
              風格調色盤
            </h2>
            <StylePalette
              selected={paletteSelected}
              onSelectedChange={onPaletteSelectedChange}
            />
          </section>

          {/* 6. Style Library */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">6</span>
              風格庫
            </h2>

            {/* Applied style badge */}
            {appliedStyleName ? (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
                <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                <span className="flex-1 text-xs font-medium text-primary truncate">{appliedStyleName}</span>
                <button
                  type="button"
                  onClick={onClearAppliedStyle}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition-colors focus-visible:outline-none"
                  aria-label="取消套用風格"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowStylePicker((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg border border-border/70 bg-muted/50 px-3 py-2.5 text-left transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-expanded={showStylePicker}
              >
                <Palette className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-xs font-medium text-foreground">套用已儲存的風格</span>
                {showStylePicker ? (
                  <ChevronUp className="w-4 h-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            )}

            {showStylePicker && !appliedStyleName && (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border bg-card custom-scrollbar">
                {savedStyles.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground text-center">尚無已儲存的風格</p>
                ) : (
                  savedStyles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => { onApplyStyle(style); setShowStylePicker(false); }}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        appliedStyleId === style.id && "bg-primary/5"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{style.name}</p>
                        {style.description && (
                          <p className="text-muted-foreground line-clamp-1 mt-0.5">{style.description}</p>
                        )}
                      </div>
                      {appliedStyleId === style.id && (
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </section>

          {/* 7. Aspect Ratio + Model Info */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">7</span>
              生成設定
            </h2>

            {/* Aspect Ratio */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">輸出比例</p>
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_RATIOS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onAspectRatioChange(id)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      aspectRatio === id
                        ? "border-primary bg-primary/8 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Model info (read-only) */}
            {globalModelLabel && (
              <p className="text-xs text-muted-foreground">
                生成模型：<span className="font-medium text-foreground">{globalModelLabel}</span>
                <span className="ml-1 text-muted-foreground/70">（可至「設定」頁面變更）</span>
              </p>
            )}
          </section>

          {/* Generate Button */}
          <Button
            onClick={isTransforming ? onCancelTransform : onTransform}
            disabled={!sourcePreview || isUploadingSource}
            className="w-full gap-2 mb-4"
            variant={isTransforming ? "outline" : "default"}
          >
            {isTransforming ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" />
                轉換中… 點擊取消
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                開始 AI 轉換
              </>
            )}
          </Button>
        </div>

        {/* ─── Mobile result (below controls, hidden on lg+) ─── */}
        <div className="lg:hidden mt-2 mb-4 overflow-hidden rounded-2xl border border-border bg-card shadow-md ring-1 ring-border/40">
          <ResultContent
            isTransforming={isTransforming}
            result={result}
            onDownloadResult={onDownloadResult}
          />
        </div>
      </div>

        {/* ─── Right: Result Preview (col-span-2, desktop only) ─── */}
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
            <ResultContent
              isTransforming={isTransforming}
              result={result}
              onDownloadResult={onDownloadResult}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
