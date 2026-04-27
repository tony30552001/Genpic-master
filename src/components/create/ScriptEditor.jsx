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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { optimizePrompt } from "../../services/aiService";
import PromptSuggestionPanel from "./PromptSuggestionPanel";
import SaveTemplateDialog from "../templates/SaveTemplateDialog";

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
  isSavingStyle,
  onAnalyze,
  onStyleNameChange,
  onStyleTagsChange,
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
    <div className="space-y-3">
      {/* ── 標題列 ── */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <label htmlFor={contentFieldId} className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <PenLine className="w-4 h-4 text-primary" aria-hidden="true" />
            內容描述
          </label>
          <p id={contentHelpId} className="text-xs text-muted-foreground">
            描述你想生成的畫面，包含人物、場景、動作和氛圍
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSmartOptimize}
            disabled={isOptimizing || !userScript?.trim()}
            className="h-8 gap-1.5 rounded-lg border-primary/20 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/15"
            title="使用 AI 自動豐富畫面細節與提示詞"
          >
            {isOptimizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
            )}
            {isOptimizing ? "優化中…" : "AI 智能優化"}
          </Button>
        </div>
      </div>

      {/* AI 優化建議面板 */}
      {suggestionData && (
        <PromptSuggestionPanel
          originalText={suggestionData.originalText}
          optimizedText={suggestionData.optimizedText}
          explanation={suggestionData.explanation}
          onAccept={handleAcceptSuggestion}
          onReject={handleRejectSuggestion}
        />
      )}

      {/* ── 文字輸入區 ── */}
      <Textarea
        id={contentFieldId}
        name="generationPrompt"
        value={userScript || ""}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        aria-describedby={contentHelpId}
        placeholder={"描述你想生成的畫面內容…\n例如：一位穿著白色洋裝的女性站在陽光灑落的咖啡廳，背景是落地窗與綠色植物"}
        className="min-h-[80px] md:min-h-[100px] resize-y text-sm leading-relaxed"
      />

      {/* 字數統計 */}
      <div className="text-xs text-muted-foreground text-right px-1">
        {charCount} 字
      </div>

      <section className="rounded-2xl border border-border/70 bg-card/70 shadow-sm">
        <button
          type="button"
          onClick={() => setShowAssistTools((open) => !open)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-expanded={assistToolsOpen}
          aria-controls={assistToolsId}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Palette className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-foreground">輔助設定</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                參考圖片、風格分析與風格庫，依需要再展開
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {hasActiveAssistTools && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                已套用
              </span>
            )}
            {assistToolsOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            )}
          </span>
        </button>

        {assistToolsOpen && (
          <div id={assistToolsId} className="space-y-3 border-t border-border/70 px-3 pb-3 pt-3">

            {onSaveTemplate && (
              <div className="rounded-xl border border-border bg-background/70 p-2.5">
                <Button
                  type="button"
                  variant={showSaveTemplate ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                  disabled={!userScript?.trim()}
                  className="h-8 w-full justify-start gap-1.5 rounded-lg px-3 text-xs font-semibold"
                  title="將當前內容與風格存為可重複使用的範本"
                  aria-expanded={showSaveTemplate}
                >
                  <LayoutTemplate className="w-3.5 h-3.5" aria-hidden="true" />
                  存為範本
                </Button>
                {showSaveTemplate && (
                  <div className="mt-2">
                    <SaveTemplateDialog
                      userScript={userScript}
                      stylePrompt={analyzedStyleForTemplate || analyzedStyle || ''}
                      styleId={selectedStyleId}
                      onSave={async (data) => { await onSaveTemplate(data); }}
                      onClose={() => setShowSaveTemplate(false)}
                    />
                  </div>
                )}
              </div>
            )}

      {/* 內容參考圖片 + 風格分析 */}
      <div className="space-y-2">
        {contentImagePreview ? (
          <div className="relative group rounded-xl overflow-hidden border border-border bg-muted/30">
            <img
              src={contentImagePreview}
              alt="Content Reference"
              width={640}
              height={192}
              className="w-full h-48 object-contain bg-muted/20"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
              <button
                type="button"
                onClick={onClearContentImage}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-sm transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title="移除參考圖片"
                aria-label="移除參考圖片"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
              參考圖片
            </div>
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
                className={`
                  relative group flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${isDraging
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40 hover:bg-muted/40'
                  }
                `}
                aria-label="上傳內容參考圖片"
              >
            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors
              ${isUploadingContent ? 'bg-muted' : 'bg-primary/10 text-primary group-hover:bg-primary/15'}
            `}>
              {isUploadingContent ? (
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Image className="w-5 h-5" aria-hidden="true" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                上傳內容參考圖片
              </p>
              <p className="text-xs text-muted-foreground">
                作為生成內容的視覺參考 (支援 JPG, PNG)
              </p>
            </div>
            </button>
          </>
        )}

        {/* 風格分析與結果顯示區 */}
        {contentImagePreview && (
          <div className="mt-1 space-y-2">
            {!analyzedStyle && !analysisResultData && (
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isAnalyzing || isUploadingContent}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/15 bg-primary/5 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {analysisPhase || "正在分析風格…"}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" aria-hidden="true" />
                    分析此圖片風格
                  </>
                )}
              </button>
            )}

            {(analyzedStyle || analysisResultData) && (
              <div className="rounded-xl p-3 space-y-2 animate-in fade-in slide-in-from-top-2 border border-border bg-muted/40">
                <h3 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
                  {String(analysisResultData?.style_name || "風格分析結果")}
                </h3>

                <div className="text-[10px] leading-relaxed text-muted-foreground bg-background p-2 rounded-lg border border-border/60">
                  {String(analysisResultData?.style_description_zh || analyzedStyle || "")}
                </div>

                {Array.isArray(analysisResultData?.suggested_tags) && (
                  <div className="flex flex-wrap gap-1">
                    {analysisResultData.suggested_tags.map((tag, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-primary/10 text-primary/80 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-1.5 border-t border-border space-y-1.5">
                  <div className="flex gap-2">
                <Input
                  type="text"
                  value={newStyleName || ''}
                  onChange={(e) => onStyleNameChange && onStyleNameChange(e.target.value)}
                  placeholder="為此風格命名…"
                  aria-label="風格名稱"
                  className="h-8 flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={onSaveStyle}
                  disabled={isSavingStyle}
                  className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {isSavingStyle ? <Loader2 className="w-3 h-3 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save className="w-3 h-3" aria-hidden="true" />}
                  收藏
                </button>
              </div>
              <Input
                type="text"
                value={newStyleTags || ''}
                onChange={(e) => onStyleTagsChange && onStyleTagsChange(e.target.value)}
                placeholder="標籤 (以逗號分隔)…"
                aria-label="風格標籤"
                className="h-8 w-full text-xs"
              />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 已套用的風格 */}
      {(analyzedStyle || selectedStyleInfo) && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-primary/5 border border-primary/10 rounded-lg">
          {selectedStyleInfo?.previewUrl && (
            <img
              src={selectedStyleInfo.previewUrl}
              alt=""
              width={32}
              height={32}
              loading="lazy"
              decoding="async"
              className="w-8 h-8 rounded-md object-cover shrink-0 border border-primary/20"
            />
          )}
          <Palette className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary/80 line-clamp-1">
              {selectedStyleInfo?.name || '已套用風格'}
            </span>
            {selectedStyleInfo?.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selectedStyleInfo.tags.slice(0, 4).map((tag, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary/70 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleClearStyle}
            className="flex h-10 w-10 items-center justify-center rounded-full text-primary/50 transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            title="移除風格"
            aria-label="移除已套用風格"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* 風格快速選取列 */}
      {savedStyles.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/20 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={showStylePicker}
          >
            <span className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" aria-hidden="true" />
              從風格庫選擇風格
              <span className="text-muted-foreground/60">({savedStyles.length})</span>
            </span>
            {showStylePicker ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          {showStylePicker && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-[320px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" aria-hidden="true" />
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

              <div className="overflow-y-auto flex-1 py-1">
                {filteredStyles.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    找不到符合的風格
                  </div>
                ) : (
                  filteredStyles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => handleApplyStyle(style)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-primary/5 transition-colors flex items-start gap-3 ${selectedStyleId === style.id ? "bg-primary/5" : ""}`}
                    >
                      {style.previewUrl ? (
                        <img
                          src={style.previewUrl}
                          alt=""
                          width={40}
                          height={40}
                          loading="lazy"
                          decoding="async"
                          className="w-10 h-10 rounded-md object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted shrink-0 flex items-center justify-center">
                          <Palette className="w-4 h-4 text-muted-foreground/40" aria-hidden="true" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {style.name}
                          </span>
                          {selectedStyleId === style.id && (
                            <Check className="w-3 h-3 text-primary shrink-0" aria-hidden="true" />
                          )}
                        </div>
                        {style.tags && style.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {style.tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded-full"
                              >
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
          </div>
        )}
      </section>

    </div>
  );
}
