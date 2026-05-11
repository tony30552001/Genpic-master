import React, { useRef } from "react";
import {
  Upload, X, Wand2, Loader2, Download,
  Palette, Copy, Scissors, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { IMAGE_MODEL_OPTIONS } from "@/config";

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
  model,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,

  // Result
  result,
  isTransforming,
  transformError,
  onTransform,
  onCancelTransform,
  onDownloadResult,
}) {
  const fileInputRef = useRef(null);
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
    <div className="flex flex-col lg:flex-row h-full min-h-0 gap-0">

      {/* ─── Left Panel: Settings ─── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] shrink-0 flex flex-col border-r border-border bg-background overflow-y-auto custom-scrollbar">
        <div className="p-4 lg:p-6 space-y-5">

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

          {/* 3. Custom Prompt */}
          <section>
            <h2 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</span>
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

          {/* 4. Model + Aspect Ratio */}
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</span>
              生成設定
            </h2>

            {/* Model */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">AI 模型</p>
              <div className="flex gap-2">
                {IMAGE_MODEL_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onModelChange(opt.id)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-lg border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      model === opt.id
                        ? "border-primary bg-primary/8 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

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
          </section>

          {/* Error Message */}
          {transformError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {transformError}
            </div>
          )}

          {/* Generate Button */}
          <Button
            onClick={isTransforming ? onCancelTransform : onTransform}
            disabled={!sourcePreview || isUploadingSource}
            className="w-full gap-2"
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
      </div>

      {/* ─── Right Panel: Result Preview ─── */}
      <div className="flex-1 min-w-0 flex flex-col items-center justify-center bg-muted/20 relative p-4 lg:p-8">
        {isTransforming ? (
          <div className="w-full max-w-xl flex flex-col items-center gap-4">
            <Skeleton className="w-full aspect-square max-w-sm rounded-xl bg-muted/80" />
            <p className="text-sm text-muted-foreground animate-pulse">AI 正在轉換圖片，請稍候…</p>
          </div>
        ) : result ? (
          <div className="w-full max-w-2xl flex flex-col items-center gap-4">
            <img
              src={result}
              alt="AI 轉換結果"
              className="w-full h-auto max-h-[65vh] object-contain rounded-xl shadow-xl animate-in fade-in zoom-in-95 duration-500"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onDownloadResult}
                className="flex items-center gap-1.5 text-sm font-medium bg-background/90 backdrop-blur-sm hover:bg-background text-foreground px-4 py-2 rounded-lg transition-colors shadow-md border border-border/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Download className="w-4 h-4 shrink-0" />
                下載圖片
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
