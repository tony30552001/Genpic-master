import React, { useCallback, useRef, useState } from "react";
import {
  Palette,
  PenLine,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Image,
  Loader2,
  Wand2,
  Save,
  LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { optimizePrompt } from "../../services/aiService";
import PromptSuggestionPanel from "./PromptSuggestionPanel";
import SaveTemplateDialog from "../templates/SaveTemplateDialog";
import { STYLE_CATEGORY_OPTIONS } from "../../constants/styleCategories";

/**
 * ScriptEditor — 內容描述編輯器
 * 支援 AI 智能優化、風格庫快速選取、內容參考圖片
 */
export default function ScriptEditor({
  userScript,
  onUserScriptChange,
  onFocus,
  onBlur,

  savedStyles = [],
  analyzedStyle,
  onApplyStyle,
  onClearStyle,
  contentImagePreview,
  onContentImageUpload,
  onClearContentImage,
  isUploadingContent,
  isAnalyzing,
  analysisPhase,
  analysisResultData,
  newStyleName,
  newStyleTags,
  newStyleCategory,
  isSavingStyle,
  onAnalyze,
  onStyleNameChange,
  onStyleTagsChange,
  onStyleCategoryChange,
  onSaveStyle,
  onSaveTemplate,
  analyzedStyleForTemplate,
  onOptimizedPromptEnChange,
}) {
  const [isDraging, setIsDraging] = useState(false);
  const fileInputRef = useRef(null);

  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleSearch, setStyleSearch] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState(null);
  const [selectedStyleInfo, setSelectedStyleInfo] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [suggestionData, setSuggestionData] = useState(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [showAssistTools, setShowAssistTools] = useState(false);

  const charCount = userScript?.length || 0;
  const contentFieldId = "script-editor-content";
  const contentHelpId = "script-editor-content-help";
  const assistToolsId = "script-editor-assist-tools";
  const hasActiveAssistTools = Boolean(
    contentImagePreview ||
    analyzedStyle ||
    analysisResultData ||
    selectedStyleInfo ||
    showStylePicker ||
    showSaveTemplate
  );
  const assistToolsOpen = showAssistTools || hasActiveAssistTools;

  const filteredStyles = savedStyles.filter((style) => {
    const q = styleSearch.toLowerCase();
    return (
      !q ||
      style.name.toLowerCase().includes(q) ||
      style.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  const handleChange = useCallback((e) => {
    const text = e.target.value;
    onUserScriptChange(text);
    if (onOptimizedPromptEnChange) {
      onOptimizedPromptEnChange("");
    }
  }, [onUserScriptChange, onOptimizedPromptEnChange]);

  const handleApplyStyle = (style) => {
    setSelectedStyleId(style.id);
    setSelectedStyleInfo({ name: style.name, tags: style.tags, previewUrl: style.previewUrl });
    onApplyStyle?.(style);
    setShowStylePicker(false);
  };

  const handleClearStyle = () => {
    setSelectedStyleId(null);
    setSelectedStyleInfo(null);
    onClearStyle?.();
  };

  const handleSmartOptimize = async () => {
    if (!userScript || !userScript.trim()) return;
    setIsOptimizing(true);
    setSuggestionData(null);
    try {
      const result = await optimizePrompt({
        userScript,
        styleContext: analyzedStyle || selectedStyleInfo?.name || ""
      });

      if (result && (result.optimizedPromptZh || result.optimizedPrompt)) {
        setSuggestionData({
          originalText: userScript,
          optimizedText: result.optimizedPromptZh || result.optimizedPrompt,
          optimizedTextEn: result.optimizedPromptEn || result.optimizedPrompt,
          explanation: result.explanation || "",
        });
      }
    } catch (err) {
      console.error("Smart optimize failed:", err);
      alert("優化失敗，請稍後再試。");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleAcceptSuggestion = () => {
    if (!suggestionData) return;
    const newText = suggestionData.optimizedText;
    onUserScriptChange(newText);
    if (onOptimizedPromptEnChange) {
      onOptimizedPromptEnChange(suggestionData.optimizedTextEn);
    }
    setSuggestionData(null);
  };

  const handleRejectSuggestion = () => {
    setSuggestionData(null);
  };

  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border bg-card shadow-md ring-1 ring-border/40">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <label htmlFor={contentFieldId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PenLine className="h-4 w-4 text-primary" aria-hidden="true" />
                內容描述
              </label>
              <p id={contentHelpId} className="text-xs leading-relaxed text-muted-foreground">
                先描述主角、場景、動作與氛圍，下一步再加入參考與風格。
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSmartOptimize}
              disabled={isOptimizing || !userScript?.trim()}
              className="h-9 shrink-0 gap-1.5 rounded-lg border-primary/30 bg-background text-xs font-semibold text-primary shadow-sm hover:bg-primary/10"
              title="使用 AI 自動豐富畫面細節與提示詞"
            >
              {isOptimizing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isOptimizing ? "優化中…" : "AI 智能優化"}
            </Button>
          </div>

          {suggestionData && (
            <PromptSuggestionPanel
              originalText={suggestionData.originalText}
              optimizedText={suggestionData.optimizedText}
              explanation={suggestionData.explanation}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
            />
          )}

          <Textarea
            id={contentFieldId}
            name="generationPrompt"
            value={userScript || ""}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            aria-describedby={contentHelpId}
            placeholder={"描述你想生成的畫面內容…\n例如：一位穿著白色洋裝的女性站在陽光灑落的咖啡廳，背景是落地窗與綠色植物"}
            className="min-h-[112px] resize-y rounded-xl border-input bg-background text-sm leading-relaxed shadow-inner focus-visible:border-primary/50 focus-visible:ring-primary/30 md:min-h-[140px]"
          />

          <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <span>建議先完成內容，再用下方參考與風格補強。</span>
            <span className="shrink-0 tabular-nums">{charCount} 字</span>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border bg-card shadow-md ring-1 ring-border/40">
        <button
          type="button"
          onClick={() => setShowAssistTools((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={assistToolsOpen}
          aria-controls={assistToolsId}
        >
          <span className="min-w-0 space-y-0.5">
            <span className="block text-sm font-semibold text-foreground">參考與風格</span>
            <span className="block truncate text-xs text-muted-foreground">
              需要時再加入參考圖片、風格分析、風格庫或範本保存。
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {hasActiveAssistTools && (
              <Badge variant="outline" className="border-primary/20 bg-primary/5 px-2 py-0 text-primary">
                已套用
              </Badge>
            )}
            {assistToolsOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
        </button>

        {assistToolsOpen && (
          <CardContent id={assistToolsId} className="space-y-4 border-t border-border bg-background/80 p-4">
            <section className="space-y-3 rounded-xl border border-border/80 bg-muted/35 p-3 shadow-inner" aria-labelledby="reference-style-title">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 id="reference-style-title" className="text-xs font-semibold text-foreground">
                    參考圖片與風格庫
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    加入一張參考圖，或套用已收藏的風格。
                  </p>
                </div>
                {savedStyles.length > 0 && (
                  <Badge variant="secondary" className="shrink-0 bg-muted text-muted-foreground hover:bg-muted">
                    {savedStyles.length} 個風格
                  </Badge>
                )}
              </div>

              {contentImagePreview ? (
                <div className="relative overflow-hidden rounded-xl border border-border bg-background shadow-sm">
                  <img
                    src={contentImagePreview}
                    alt="內容參考圖片"
                    width={640}
                    height={192}
                    className="h-48 w-full object-contain bg-muted/40"
                  />
                  <div className="absolute inset-0 flex items-start justify-end bg-black/0 p-2 opacity-0 transition-colors hover:bg-black/10 hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={onClearContentImage}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      title="移除參考圖片"
                      aria-label="移除參考圖片"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white backdrop-blur-sm">
                    參考圖片
                  </span>
                </div>
              ) : (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onContentImageUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDraging(true); }}
                    onDragLeave={() => setIsDraging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraging(false);
                      const file = e.dataTransfer.files[0];
                      if (file && onContentImageUpload) {
                        onContentImageUpload({ target: { files: [file] } });
                      }
                    }}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border-2 border-dashed bg-background px-4 py-3 text-left shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isDraging
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50 hover:bg-primary/5"
                    )}
                    aria-label="上傳內容參考圖片"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors",
                        isUploadingContent ? "bg-muted" : "bg-primary/10 text-primary group-hover:bg-primary/15"
                      )}
                    >
                      {isUploadingContent ? (
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <Image className="h-5 w-5" aria-hidden="true" />
                      )}
                    </span>
                    <span className="flex-1 text-left">
                      <span className="block text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                        上傳內容參考圖片
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        作為生成內容的視覺參考，支援 JPG、PNG。
                      </span>
                    </span>
                  </button>
                </>
              )}

              {contentImagePreview && (
                <div className="space-y-2">
                  {!analyzedStyle && !analysisResultData && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={onAnalyze}
                      disabled={isAnalyzing || isUploadingContent}
                      className="h-9 w-full gap-2 rounded-lg border-primary/15 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                          {analysisPhase || "正在分析風格…"}
                        </>
                      ) : (
                        <>
                          <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />
                          分析此圖片風格
                        </>
                      )}
                    </Button>
                  )}

                  {(analyzedStyle || analysisResultData) && (
                    <div className="space-y-3 rounded-xl border border-border bg-background p-3 shadow-sm animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1">
                        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                          <Wand2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
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
                            onChange={(e) => onStyleNameChange && onStyleNameChange(e.target.value)}
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
                              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                            ) : (
                              <Save className="h-3.5 w-3.5" aria-hidden="true" />
                            )}
                            收藏
                          </Button>
                        </div>
                        <Input
                          type="text"
                          value={newStyleTags || ""}
                          onChange={(e) => onStyleTagsChange && onStyleTagsChange(e.target.value)}
                          placeholder="標籤，以逗號分隔…"
                          aria-label="風格標籤"
                          className="h-9 w-full text-xs"
                        />
                        <label className="block space-y-1 text-xs font-medium text-foreground">
                          <span>用途分類</span>
                          <select
                            value={newStyleCategory || "general"}
                            onChange={(e) => onStyleCategoryChange && onStyleCategoryChange(e.target.value)}
                            className="h-9 w-full rounded-lg border border-input bg-background px-3 text-xs font-normal text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            aria-label="風格用途分類"
                          >
                            {STYLE_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span className="block text-[11px] font-normal text-muted-foreground">
                            分類會用於共享風格庫瀏覽，之後仍可調整。
                          </span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(analyzedStyle || selectedStyleInfo) && (
                <div className="flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2.5 shadow-sm">
                  {selectedStyleInfo?.previewUrl && (
                    <img
                      src={selectedStyleInfo.previewUrl}
                      alt=""
                      width={36}
                      height={36}
                      loading="lazy"
                      decoding="async"
                      className="h-9 w-9 shrink-0 rounded-lg border border-primary/20 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-primary">
                      {selectedStyleInfo?.name || "已套用風格"}
                    </span>
                    {selectedStyleInfo?.tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {selectedStyleInfo.tags.slice(0, 4).map((tag, i) => (
                          <Badge key={i} variant="outline" className="border-primary/15 px-1.5 py-0 text-primary/70">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleClearStyle}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    title="移除風格"
                    aria-label="移除已套用風格"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {savedStyles.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowStylePicker(!showStylePicker)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/80 bg-background px-3 py-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    aria-expanded={showStylePicker}
                  >
                    <span className="flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                      從風格庫選擇風格
                      <span className="text-muted-foreground/60">({savedStyles.length})</span>
                    </span>
                    {showStylePicker ? (
                      <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>

                  {showStylePicker && (
                    <div className="absolute left-0 right-0 top-full z-50 mt-1 flex max-h-[320px] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="sticky top-0 border-b border-border bg-popover px-3 py-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          <Input
                            type="text"
                            placeholder="搜尋風格…"
                            aria-label="搜尋風格"
                            value={styleSearch}
                            onChange={(e) => setStyleSearch(e.target.value)}
                            className="h-8 w-full rounded-lg py-1.5 pl-8 pr-3 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto py-1">
                        {filteredStyles.length === 0 ? (
                          <div className="py-6 text-center text-xs text-muted-foreground">
                            找不到符合的風格
                          </div>
                        ) : (
                          filteredStyles.map((style) => (
                            <button
                              type="button"
                              key={style.id}
                              onClick={() => handleApplyStyle(style)}
                              className={cn(
                                "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                                selectedStyleId === style.id && "bg-primary/5"
                              )}
                            >
                              {style.previewUrl ? (
                                <img
                                  src={style.previewUrl}
                                  alt=""
                                  width={40}
                                  height={40}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                                />
                              ) : (
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                                  <Palette className="h-4 w-4 text-muted-foreground/40" aria-hidden="true" />
                                </span>
                              )}

                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="truncate text-xs font-medium text-foreground">
                                    {style.name}
                                  </span>
                                  {style.visibility === "shared" && (
                                    <Badge variant="outline" className="border-primary/15 px-1.5 py-0 text-[10px] text-primary">
                                      共享
                                    </Badge>
                                  )}
                                  {selectedStyleId === style.id && (
                                    <Check className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                                  )}
                                </span>
                                {style.tags && style.tags.length > 0 && (
                                  <span className="mt-1 flex flex-wrap gap-1">
                                    {style.tags.slice(0, 3).map((tag, i) => (
                                      <Badge key={i} variant="secondary" className="bg-muted px-1.5 py-0 text-muted-foreground hover:bg-muted">
                                        #{tag}
                                      </Badge>
                                    ))}
                                  </span>
                                )}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {onSaveTemplate && (
              <section className="space-y-2 rounded-xl border border-border/80 bg-muted/35 p-3 shadow-inner" aria-labelledby="template-save-title">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 id="template-save-title" className="text-xs font-semibold text-foreground">
                      範本與保存
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      將常用內容與風格存成範本，之後可快速套用。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant={showSaveTemplate ? "default" : "outline"}
                    size="sm"
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    disabled={!userScript?.trim()}
                    className="h-9 shrink-0 gap-1.5 rounded-lg px-3 text-xs font-semibold"
                    title="將當前內容與風格存為可重複使用的範本"
                    aria-expanded={showSaveTemplate}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                    存為範本
                  </Button>
                </div>
                {showSaveTemplate && (
                  <div className="pt-1">
                    <SaveTemplateDialog
                      userScript={userScript}
                      stylePrompt={analyzedStyleForTemplate || analyzedStyle || ""}
                      styleId={selectedStyleId}
                      onSave={async (data) => { await onSaveTemplate(data); }}
                      onClose={() => setShowSaveTemplate(false)}
                    />
                  </div>
                )}
              </section>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
