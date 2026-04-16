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

  const charCount = userScript?.length || 0;

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
          <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <PenLine className="w-4 h-4 text-primary" />
            內容描述
          </label>
          <p className="text-xs text-muted-foreground">
            描述你想生成的畫面，包含人物、場景、動作和氛圍
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onSaveTemplate && (
            <button
              onClick={() => setShowSaveTemplate(!showSaveTemplate)}
              disabled={!userScript?.trim()}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
                ${!userScript?.trim()
                  ? 'bg-muted text-muted-foreground/40 border-border cursor-not-allowed'
                  : 'bg-primary text-primary-foreground border-transparent shadow-sm hover:bg-primary/90'
                }
              `}
              title="將當前內容與風格存為可重複使用的範本"
            >
              <LayoutTemplate className="w-3.5 h-3.5" />
              存為範本
            </button>
          )}
          <button
            onClick={handleSmartOptimize}
            disabled={isOptimizing || !userScript?.trim()}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
              ${!userScript?.trim()
                ? 'bg-muted text-muted-foreground/40 border-border cursor-not-allowed'
                : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/15'
              }
            `}
            title="使用 AI 自動豐富畫面細節與提示詞"
          >
            {isOptimizing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Wand2 className="w-3.5 h-3.5" />
            )}
            {isOptimizing ? "優化中..." : "AI 智能優化"}
          </button>
        </div>
      </div>

      {/* 存為範本面板 */}
      {showSaveTemplate && onSaveTemplate && (
        <SaveTemplateDialog
          userScript={userScript}
          stylePrompt={analyzedStyleForTemplate || analyzedStyle || ''}
          styleId={selectedStyleId}
          onSave={async (data) => { await onSaveTemplate(data); }}
          onClose={() => setShowSaveTemplate(false)}
        />
      )}

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
        value={userScript || ""}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={"描述你想生成的畫面內容...\n例如：一位穿著白色洋裝的女性站在陽光灑落的咖啡廳，背景是落地窗與綠色植物"}
        className="min-h-[80px] md:min-h-[100px] resize-y text-sm leading-relaxed"
      />

      {/* 字數統計 */}
      <div className="text-xs text-muted-foreground text-right px-1">
        {charCount} 字
      </div>

      {/* ── 風格設定 分隔 ── */}
      <div className="flex items-center gap-2 pt-1">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest px-1">風格設定</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* 內容參考圖片 + 風格分析 */}
      <div className="space-y-2">
        {contentImagePreview ? (
          <div className="relative group rounded-xl overflow-hidden border border-border bg-muted/30">
            <img
              src={contentImagePreview}
              alt="Content Reference"
              className="w-full h-48 object-contain bg-muted/20"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
              <button
                onClick={onClearContentImage}
                className="p-1.5 bg-card text-muted-foreground hover:text-destructive rounded-full shadow-sm transition-colors"
                title="移除參考圖片"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="absolute bottom-2 left-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full backdrop-blur-sm">
              參考圖片
            </div>
          </div>
        ) : (
          <div
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
              relative group flex items-center gap-3 px-4 py-3 rounded-xl border-dashed border-2 cursor-pointer transition-all
              ${isDraging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40 hover:bg-muted/40'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onContentImageUpload}
              className="hidden"
            />
            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors
              ${isUploadingContent ? 'bg-muted' : 'bg-primary/8 text-primary group-hover:bg-primary/12'}
            `}>
              {isUploadingContent ? (
                <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-primary rounded-full animate-spin" />
              ) : (
                <Image className="w-5 h-5" />
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
          </div>
        )}

        {/* 風格分析與結果顯示區 */}
        {contentImagePreview && (
          <div className="mt-1 space-y-2">
            {!analyzedStyle && !analysisResultData && (
              <button
                onClick={onAnalyze}
                disabled={isAnalyzing || isUploadingContent}
                className="w-full py-2 bg-primary/5 hover:bg-primary/10 text-primary rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-primary/15"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
                    {analysisPhase || "正在分析風格..."}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    分析此圖片風格
                  </>
                )}
              </button>
            )}

            {(analyzedStyle || analysisResultData) && (
              <div className="rounded-xl p-3 space-y-2 animate-in fade-in slide-in-from-top-2 border border-border bg-muted/40">
                <h3 className="font-semibold text-foreground text-xs flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-primary" />
                  {String(analysisResultData?.style_name || "風格分析結果")}
                </h3>

                <div className="text-[10px] leading-relaxed text-muted-foreground bg-background p-2 rounded-lg border border-border/60">
                  {String(analysisResultData?.style_description_zh || analyzedStyle || "")}
                </div>

                {Array.isArray(analysisResultData?.suggested_tags) && (
                  <div className="flex flex-wrap gap-1">
                    {analysisResultData.suggested_tags.map((tag, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 bg-primary/8 text-primary/80 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="pt-1.5 border-t border-border space-y-1.5">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newStyleName || ''}
                      onChange={(e) => onStyleNameChange && onStyleNameChange(e.target.value)}
                      placeholder="為此風格命名..."
                      className="flex-1 text-xs border border-input rounded px-2 py-1 focus:border-primary outline-none bg-background"
                    />
                    <button
                      onClick={onSaveStyle}
                      disabled={isSavingStyle}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      {isSavingStyle ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                      收藏
                    </button>
                  </div>
                  <input
                    type="text"
                    value={newStyleTags || ''}
                    onChange={(e) => onStyleTagsChange && onStyleTagsChange(e.target.value)}
                    placeholder="標籤 (以逗號分隔)..."
                    className="w-full text-xs border border-input rounded px-2 py-1 focus:border-primary outline-none bg-background"
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
            <img src={selectedStyleInfo.previewUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0 border border-primary/20" />
          )}
          <Palette className="w-3.5 h-3.5 text-primary shrink-0" />
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
            onClick={handleClearStyle}
            className="p-1 hover:bg-primary/10 text-primary/50 hover:text-primary rounded-full transition-colors"
            title="移除風格"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 風格快速選取列 */}
      {savedStyles.length > 0 && (
        <div className="relative">
          <button
            onClick={() => setShowStylePicker(!showStylePicker)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-primary bg-muted/50 hover:bg-primary/5 border border-border hover:border-primary/20 px-3 py-2 rounded-lg transition-all w-full justify-between"
          >
            <span className="flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5" />
              從風格庫選擇風格
              <span className="text-muted-foreground/60">({savedStyles.length})</span>
            </span>
            {showStylePicker ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {showStylePicker && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-xl shadow-xl overflow-hidden max-h-[320px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="sticky top-0 bg-popover border-b border-border px-3 py-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="搜尋風格..."
                    value={styleSearch}
                    onChange={(e) => setStyleSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-input rounded-lg focus:border-primary focus:ring-1 focus:ring-primary/30 outline-none bg-background"
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
                          className="w-10 h-10 rounded-md object-cover shrink-0 border border-border"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-muted shrink-0 flex items-center justify-center">
                          <Palette className="w-4 h-4 text-muted-foreground/40" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-foreground truncate">
                            {style.name}
                          </span>
                          {selectedStyleId === style.id && (
                            <Check className="w-3 h-3 text-primary shrink-0" />
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
  );
}
