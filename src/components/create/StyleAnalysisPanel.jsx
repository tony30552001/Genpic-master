import React from "react";
import { Save } from "@/components/icons/lucideControls";
import { Loader2 } from "@/components/icons/lucideStatus";
import { Wand2 } from "@/components/icons/lucideContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 風格參考圖的分析按鈕、分析結果與收藏。 */
export default function StyleAnalysisPanel({
  analyzedStyle,
  analysisResultData,
  analysisPhase,
  isAnalyzing,
  isUploading,
  newStyleName,
  newStyleTags,
  isSavingStyle,
  onAnalyze,
  onStyleNameChange,
  onStyleTagsChange,
  onSaveStyle,
}) {
  if (!analyzedStyle && !analysisResultData) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAnalyze}
        disabled={isAnalyzing || isUploading}
        className="h-9 w-full gap-2 rounded-lg border-primary/15 text-xs font-medium text-primary hover:bg-primary/10"
      >
        {isAnalyzing ? (
          <>
            <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {analysisPhase || "正在分析風格…"}
          </>
        ) : (
          <>
            <Wand2 className="icon-sm" aria-hidden="true" />
            分析此圖片風格
          </>
        )}
      </Button>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-(--motion-enter) ease-emphasized motion-reduce:animate-none">
      <div className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Wand2 className="icon-sm text-primary" aria-hidden="true" />
          {String(analysisResultData?.style_name || "風格分析結果")}
        </h3>
        <p className="rounded-lg border border-border/80 bg-muted/40 p-2 text-xs leading-relaxed text-muted-foreground">
          {String(analysisResultData?.style_description_zh || analyzedStyle || "")}
        </p>
      </div>

      {Array.isArray(analysisResultData?.suggested_tags) && (
        <div className="flex flex-wrap gap-1.5">
          {analysisResultData.suggested_tags.map((tag, i) => (
            <Badge key={i} variant="outline" className="border-primary/15 bg-background text-primary/80">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex gap-2">
          <Input
            type="text"
            value={newStyleName || ""}
            onChange={(e) => onStyleNameChange?.(e.target.value)}
            placeholder="為此風格命名…"
            aria-label="風格名稱"
            className="h-9 flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            onClick={onSaveStyle}
            disabled={isSavingStyle}
            className="h-9 shrink-0 gap-1.5 px-3 text-xs"
          >
            {isSavingStyle ? (
              <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Save className="icon-sm" aria-hidden="true" />
            )}
            收藏
          </Button>
        </div>
        <Input
          type="text"
          value={newStyleTags || ""}
          onChange={(e) => onStyleTagsChange?.(e.target.value)}
          placeholder="標籤，以逗號分隔…"
          aria-label="風格標籤"
          className="h-9 w-full text-xs"
        />
      </div>
    </div>
  );
}
