import React from "react";
import { Upload, Palette, Wand2, Tag, Save, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function StyleAnalyzer({
  referencePreview,
  isUploading,
  uploadProgress,
  isAnalyzing,
  analyzedStyle,
  analysisResultData,
  newStyleName,
  newStyleTags,
  isSavingStyle,
  analysisPhase, // 新增：接收分析階段狀態
  onImageUpload,
  onClearReference,
  onAnalyze,
  onStyleNameChange,
  onStyleTagsChange,
  onSaveStyle,
  onClearStyle,
}) {
  const showProgress = isUploading || uploadProgress > 0;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-foreground font-semibold">
        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs">
          1
        </div>
        上傳風格範例圖
      </div>

      <div className="relative group">
        <input
          type="file"
          accept="image/*"
          onChange={onImageUpload}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <div
          className={`border-2 border-dashed rounded-xl p-4 transition-colors text-center ${referencePreview
              ? "border-primary/40 bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/30"
            }`}
        >
          {referencePreview ? (
            <div className="relative h-32 w-full">
              <img
                src={referencePreview}
                alt="風格參考圖片"
                width={512}
                height={128}
                className="h-full w-full object-contain rounded-md"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md pointer-events-none">
                <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
                  點擊更換
                </span>
              </div>
              <button
                type="button"
                onClick={onClearReference}
                className="absolute -top-2 -right-2 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-md transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title="移除圖片與風格"
                aria-label="移除圖片與風格"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center text-muted-foreground">
              <Upload className="w-8 h-8 mb-2" />
              <span className="text-sm">點擊上傳或拖曳圖片</span>
              <span className="text-xs mt-1">支援 JPG, PNG</span>
            </div>
          )}
        </div>
      </div>

      {showProgress && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-[width] motion-reduce:transition-none"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {isUploading ? "上傳中…" : "上傳完成"} {uploadProgress}%
          </div>
        </div>
      )}

      <Button
        onClick={onAnalyze}
        disabled={!referencePreview || isAnalyzing || isUploading}
        className="w-full"
      >
        {isAnalyzing ? (
          <Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <Palette className="w-4 h-4" aria-hidden="true" />
        )}
        {isUploading
          ? "上傳中，請稍候…"
          : isAnalyzing
            ? "正在全方位分析…"
            : "解析風格與內容"}
      </Button>

      {isAnalyzing && analysisPhase && (
        <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {analysisPhase}
              </p>
              <div className="mt-2 h-1.5 w-full bg-primary/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: analysisPhase.includes("儲存") ? "90%" : analysisPhase.includes("解析") ? "60%" : "30%" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {analyzedStyle && (
        <div className="bg-card border border-primary/10 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 relative">
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-foreground text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              {analysisResultData?.style_name || "風格分析結果"}
            </h3>
            <button
              onClick={onClearStyle}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="清除風格"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-xs leading-relaxed text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/50">
            {analysisResultData?.style_description_zh || analyzedStyle}
          </div>

          {Array.isArray(analysisResultData?.suggested_tags) && (
            <div className="flex flex-wrap gap-1">
              {analysisResultData.suggested_tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 bg-muted text-muted-foreground rounded-full flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-border/50 space-y-2">
            <div className="flex gap-2">
              <Input
                type="text"
                value={newStyleName}
                onChange={(e) => onStyleNameChange(e.target.value)}
                placeholder="為此風格命名…"
                className="flex-1 text-xs h-8"
              />
              <Button
                onClick={onSaveStyle}
                disabled={isSavingStyle}
                size="sm"
                className="h-8 px-3"
              >
                {isSavingStyle ? (
                  <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                收藏
              </Button>
            </div>
            <Input
              type="text"
              value={newStyleTags}
              onChange={(e) => onStyleTagsChange(e.target.value)}
              placeholder="標籤 (以逗號分隔)…"
              className="w-full text-xs h-8"
            />
          </div>
        </div>
      )}
    </div>
  );
}
