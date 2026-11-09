import React, { useCallback, useEffect, useState } from "react";
import {
  X,
  ChevronDown,
} from "@/components/icons/lucideControls";
import {
  Loader2,
} from "@/components/icons/lucideStatus";
import {
  PenLine,
  Wand2,
  LayoutTemplate,
} from "@/components/icons/lucideContent";
import * as M from "motion/react-m";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OVERLAY_ENTER, OVERLAY_EXIT } from "@/lib/motionTokens";
import { optimizePrompt } from "../../services/aiService";
import PromptSuggestionPanel from "./PromptSuggestionPanel";
import SaveTemplateDialog from "../templates/SaveTemplateDialog";
import { STYLE_DIMENSIONS } from "./styleDimensions";
import StyleSourceTabs from "./StyleSourceTabs";
import PromptHints from "./PromptHints";
import { detectNoTextIntent } from "@/lib/promptHints";
import { NO_TEXT_LANGUAGE } from "@/lib/imageTextLanguage";
import { pastedImageFile } from "@/lib/imageFile";
import { REFERENCE_PURPOSE, STYLE_TRANSFER_PURPOSE } from "@/lib/attachmentPurposes";
import { IMAGE_PURPOSE_OPTIONS } from "@/lib/imagePurposes";

const ADVANCED_STYLE_OPEN_KEY = "genpic_advanced_style_open";

const readAdvancedStyleOpen = () => {
  try {
    return localStorage.getItem(ADVANCED_STYLE_OPEN_KEY) === "1";
  } catch {
    return false;
  }
};

const DEFAULT_PLACEHOLDER = "描述你想要的畫面";

const EXAMPLE_PROMPTS = {
  infographic: ["台灣手搖飲市場規模一覽", "新人到職五步驟流程", "節能減碳的三個小習慣"],
  freeform: ["陽光灑落的咖啡廳，穿白洋裝的女性", "漂浮在雲上的小島", "柴犬太空人在月球散步"],
};

/**
 * ScriptEditor — 內容描述、圖片輸入插槽與進階風格
 * 內容圖用途決定欄位文字、AI 優化模式與是否套用風格；風格參考圖與內容圖彼此獨立。
 */
export default function ScriptEditor({
  userScript,
  onUserScriptChange,
  onFocus,
  onBlur,

  attachmentPurpose = null,
  imageInputsSlot = null,
  onAttachFile,
  isUploadingAttachment = false,
  onUseStyleTransfer,
  savedStyles = [],
  analyzedStyle,
  onApplyStyle,
  onClearStyle,
  analysisResultData,
  onSaveTemplate,
  analyzedStyleForTemplate,
  onOptimizedPromptEnChange,
  onPaletteStyleChange,
  onGenerate,
  paletteStyleTags = [],
  imageLanguage = "",
  onImageLanguageChange,
  imagePurpose = "infographic",
  aspectRatio = "1:1",
  onImagePurposeChange,
}) {
  const [selectedStyleId, setSelectedStyleId] = useState(null);
  const [selectedStyleInfo, setSelectedStyleInfo] = useState(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [suggestionData, setSuggestionData] = useState(null);
  const [appliedFlash, setAppliedFlash] = useState(0);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(readAdvancedStyleOpen);
  const [showStyleSource, setShowStyleSource] = useState(false);
  const [styleSourceTab, setStyleSourceTab] = useState("templates");
  const [paletteSelected, setPaletteSelected] = useState({});
  const [noTextHintDismissedFor, setNoTextHintDismissedFor] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(ADVANCED_STYLE_OPEN_KEY, advancedOpen ? "1" : "0");
    } catch {
      // The panel falls back to collapsed next time when storage is unavailable.
    }
  }, [advancedOpen]);

  const purposeId = attachmentPurpose?.id || REFERENCE_PURPOSE;
  const isTransform = purposeId !== REFERENCE_PURPOSE;
  const styleIgnored = attachmentPurpose ? !attachmentPurpose.usesStyle : false;

  const promptHints = [];
  if (
    onImageLanguageChange &&
    imageLanguage !== NO_TEXT_LANGUAGE &&
    noTextHintDismissedFor !== userScript &&
    detectNoTextIntent(userScript)
  ) {
    promptHints.push({
      id: "no-text",
      message: "偵測到你不要圖中文字，改用「無文字」效果更穩定。",
      actionLabel: "改用無文字",
      onAction: () => onImageLanguageChange(NO_TEXT_LANGUAGE),
      onDismiss: () => setNoTextHintDismissedFor(userScript),
    });
  }

  // 調色盤 tag 選擇變更時，計算風格字串並通知父元件
  const handlePaletteChange = useCallback((newSelected) => {
    setPaletteSelected(newSelected);
    const allTags = STYLE_DIMENSIONS.flatMap((d) => newSelected[d.id] || []);
    onPaletteStyleChange?.(allTags);
    onOptimizedPromptEnChange?.("");
    setShowStyleSource(true);
    setStyleSourceTab("palette");
  }, [onOptimizedPromptEnChange, onPaletteStyleChange]);

  const charCount = userScript?.length || 0;
  const contentFieldId = "script-editor-content";
  const contentHelpId = "script-editor-content-help";
  const advancedId = "script-editor-advanced-style";
  const purposeLabelId = "script-editor-purpose";
  const activePurpose =
    IMAGE_PURPOSE_OPTIONS.find((option) => option.id === imagePurpose) ||
    IMAGE_PURPOSE_OPTIONS[0];
  const fieldLabel = attachmentPurpose?.fieldLabel || "內容描述";
  const placeholder = attachmentPurpose?.placeholder || DEFAULT_PLACEHOLDER;
  const appliedStyleName =
    selectedStyleInfo?.name ||
    (analyzedStyle ? String(analysisResultData?.style_name || "參考圖風格") : "") ||
    (paletteStyleTags.length ? `${paletteStyleTags.length} 個風格標籤` : "");
  const hasAppliedStyle = Boolean(appliedStyleName);
  const advancedSummary = purposeId === STYLE_TRANSFER_PURPOSE
    ? `套用風格到內容圖${appliedStyleName ? `：${appliedStyleName}` : ""}`
    : appliedStyleName || "未套用";

  const handleChange = useCallback((e) => {
    const text = e.target.value;
    onUserScriptChange(text);
    setOptimizeError("");
    if (onOptimizedPromptEnChange) {
      onOptimizedPromptEnChange("");
    }
  }, [onUserScriptChange, onOptimizedPromptEnChange]);

  const handleApplyStyle = (style) => {
    setSelectedStyleId(style.id);
    setSelectedStyleInfo({ name: style.name, tags: style.tags, previewUrl: style.previewUrl });
    onApplyStyle?.(style);
    onOptimizedPromptEnChange?.("");
    setShowStyleSource(true);
    setStyleSourceTab("saved");
  };

  const handleClearStyle = () => {
    setSelectedStyleId(null);
    setSelectedStyleInfo(null);
    onClearStyle?.();
    onOptimizedPromptEnChange?.("");
  };

  const handleClearAllStyle = () => {
    handleClearStyle();
    setPaletteSelected({});
    onPaletteStyleChange?.([]);
  };

  const handleSmartOptimize = async () => {
    if (!userScript || !userScript.trim()) return;
    setIsOptimizing(true);
    setOptimizeError("");
    setSuggestionData(null);
    try {
      const result = await optimizePrompt({
        userScript,
        styleContext: [analyzedStyle, paletteStyleTags.join("，"), selectedStyleInfo?.name]
          .filter(Boolean)
          .join("，") || "",
        imageLanguage,
        imagePurpose,
        aspectRatio,
        ...(isTransform
          ? { optimizationMode: "transform", transformMode: purposeId }
          : { optimizationMode: "generation" }),
      });

      if (result && (result.optimizedPromptZh || result.optimizedPrompt)) {
        setSuggestionData({
          originalText: userScript,
          optimizedText: result.optimizedPromptZh || result.optimizedPrompt,
          optimizedTextEn: result.optimizedPromptEn || result.optimizedPrompt,
          explanation: result.explanation || "",
        });
      } else {
        setOptimizeError("AI 未回傳可用的優化內容，請稍後再試。");
      }
    } catch (err) {
      console.error("Smart optimize failed:", err);
      setOptimizeError(err?.message || "優化失敗，請稍後再試。");
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
    setAppliedFlash((count) => count + 1);
  };

  const handleRejectSuggestion = () => {
    setSuggestionData(null);
  };

  return (
    <div className="lg:space-y-4">
      <Card className="rounded-none border-0 bg-transparent shadow-none lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-md lg:ring-1 lg:ring-border/40">
        <CardContent className="space-y-3 px-0 pb-4 pt-1 lg:p-4">
          <div className="flex items-center justify-between gap-3 lg:items-start">
            <div className="min-w-0 space-y-1">
              <label htmlFor={contentFieldId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <PenLine className="icon-sm text-primary" aria-hidden="true" />
                {fieldLabel}
              </label>
              <p id={contentHelpId} className="hidden text-xs leading-relaxed text-muted-foreground lg:block">
                {isTransform
                  ? "描述這次要對內容圖做的事，未提到的部分會盡量保持不變。"
                  : "先描述主角、場景、動作與氛圍，需要時再加圖片或設定風格。"}
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSmartOptimize}
              disabled={isOptimizing || !userScript?.trim()}
              className="relative h-9 shrink-0 gap-1.5 rounded-lg border-primary/30 bg-background px-3 text-xs font-semibold text-primary shadow-sm after:absolute after:-inset-y-1 after:inset-x-0 hover:bg-primary/10 touch-manipulation"
              title="使用 AI 自動豐富畫面細節與提示詞"
            >
              {isOptimizing ? (
                <Loader2 className="icon-sm animate-spin motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Wand2 className="icon-sm" aria-hidden="true" />
              )}
              {isOptimizing ? "優化中…" : "AI 智能優化"}
            </Button>
          </div>

          {optimizeError && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs leading-relaxed text-destructive"
            >
              {optimizeError}
            </div>
          )}

          <AnimatePresence initial={false}>
          {suggestionData && (
            <M.div key="prompt-suggestion" exit={{ opacity: 0, transition: OVERLAY_EXIT }}>
            <PromptSuggestionPanel
              originalText={suggestionData.originalText}
              optimizedText={suggestionData.optimizedText}
              explanation={suggestionData.explanation}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
            />
            </M.div>
          )}
          </AnimatePresence>

          <div className="relative">
          <Textarea
            id={contentFieldId}
            name="generationPrompt"
            value={userScript || ""}
            onChange={handleChange}
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                onGenerate?.();
              }
            }}
            onPaste={(event) => {
              const file = onAttachFile && pastedImageFile(event);
              if (!file) return;
              event.preventDefault();
              if (!isUploadingAttachment) onAttachFile(file);
            }}
            aria-describedby={contentHelpId}
            placeholder={placeholder}
            className="min-h-[112px] resize-y rounded-xl border-input bg-background text-sm leading-relaxed shadow-inner focus-visible:border-primary/50 focus-visible:ring-primary/30 md:min-h-[140px]"
          />
          {appliedFlash > 0 && (
            <M.span
              key={appliedFlash}
              className="pointer-events-none absolute inset-0 rounded-xl bg-primary/10 ring-1 ring-primary/40"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ ...OVERLAY_ENTER, duration: 0.4 }}
              aria-hidden="true"
              data-applied-flash
            />
          )}
          </div>

          <PromptHints hints={promptHints} />

          {!attachmentPurpose && !userScript?.trim() && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 max-lg:-mx-4 max-lg:px-4 lg:flex-wrap" role="group" aria-label="範例">
              {(EXAMPLE_PROMPTS[imagePurpose] || EXAMPLE_PROMPTS.freeform).map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    onUserScriptChange(example);
                    onOptimizedPromptEnChange?.("");
                  }}
                  className="min-h-9 shrink-0 rounded-full border border-border/70 bg-background px-3 text-xs text-muted-foreground press-feedback hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 px-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className={cn(!isTransform && "hidden lg:inline")}>
                {isTransform ? "結果會沿用內容圖比例。" : "建議先完成內容，再用圖片或風格補強。"}
              </span>
              {onGenerate && (
                <span className="hidden items-center gap-1 sm:flex">
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
                  <span className="text-[10px]">+</span>
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd>
                  <span className="text-[10px] text-muted-foreground/70">生圖</span>
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">{charCount} 字</span>
          </div>

          {!isTransform && (
          <div className="space-y-1.5 lg:rounded-xl lg:border lg:border-border/60 lg:bg-muted/30 lg:px-3 lg:py-2.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span id={purposeLabelId} className="text-xs font-semibold text-foreground">
                畫面用途
              </span>
              <span className="hidden min-w-0 truncate text-[11px] text-muted-foreground lg:inline">
                {activePurpose.description}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-labelledby={purposeLabelId}>
              {IMAGE_PURPOSE_OPTIONS.map((option) => {
                const isSelected = activePurpose.id === option.id;

                return (
                  <button
                    type="button"
                    key={option.id}
                    onClick={() => {
                      onImagePurposeChange?.(option.id);
                      onOptimizedPromptEnChange?.("");
                    }}
                    aria-pressed={isSelected}
                    className={cn(
                      "min-h-9 rounded-lg border px-3 text-xs font-medium press-feedback focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/60"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
          )}

        </CardContent>
      </Card>

      {imageInputsSlot}

      <Card className="rounded-none border-0 bg-transparent shadow-none lg:rounded-2xl lg:border lg:border-border lg:bg-card lg:shadow-sm">
        <div className="flex items-center gap-2 lg:pr-2">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex min-h-11 min-w-0 flex-1 touch-manipulation items-center justify-between gap-3 rounded-lg py-3 lg:rounded-2xl lg:px-4 text-left press-feedback hover:bg-muted/60 active:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-expanded={advancedOpen}
            aria-controls={advancedId}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ChevronDown
                className={cn(
                  "icon-sm shrink-0 text-muted-foreground transition-transform duration-(--motion-hover) ease-emphasized",
                  !advancedOpen && "-rotate-90"
                )}
                aria-hidden="true"
              />
              <span className="shrink-0 text-sm font-semibold text-foreground">進階：風格</span>
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-xs",
                hasAppliedStyle || purposeId === STYLE_TRANSFER_PURPOSE
                  ? "font-semibold text-primary"
                  : "text-muted-foreground"
              )}
            >
              {advancedSummary}
            </span>
          </button>
          {hasAppliedStyle && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={handleClearAllStyle}
              aria-label="清除套用的風格"
            >
              <X className="icon-sm" aria-hidden="true" />
            </Button>
          )}
        </div>

        <div
          id={advancedId}
          aria-hidden={!advancedOpen}
          inert={!advancedOpen}
          className={cn(
            "grid overflow-hidden transition-[grid-template-rows,opacity] motion-reduce:transition-none",
            advancedOpen
              ? "grid-rows-[1fr] opacity-100 duration-(--motion-enter) ease-emphasized"
              : "pointer-events-none grid-rows-[0fr] opacity-0 duration-(--motion-exit) ease-exit"
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <CardContent className="space-y-5 px-0 pb-4 pt-1 lg:space-y-4 lg:border-t lg:border-border lg:bg-background/80 lg:p-4">
              {styleIgnored && hasAppliedStyle && (
                <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
                  「{attachmentPurpose.label}」只依你的描述修改，不會套用風格。
                </p>
              )}

              {onUseStyleTransfer && (
                <section className="flex flex-wrap items-center justify-between gap-2 lg:rounded-xl lg:border lg:border-border/80 lg:bg-muted/35 lg:p-3" aria-labelledby="style-transfer-title">
                  <div className="min-w-0 space-y-0.5">
                    <h3 id="style-transfer-title" className="text-xs font-semibold text-foreground">套用風格到內容圖</h3>
                    <p className="hidden text-xs text-muted-foreground lg:block">保留內容圖內容與構圖，只改變畫風。</p>
                  </div>
                  <Button
                    type="button"
                    variant={purposeId === STYLE_TRANSFER_PURPOSE ? "default" : "outline"}
                    size="sm"
                    className="h-9 shrink-0 text-xs"
                    onClick={onUseStyleTransfer}
                    aria-pressed={purposeId === STYLE_TRANSFER_PURPOSE}
                  >
                    {purposeId === STYLE_TRANSFER_PURPOSE ? "使用中" : "使用"}
                  </Button>
                </section>
              )}

            <StyleSourceTabs
              open={showStyleSource}
              onOpenChange={setShowStyleSource}
              activeTab={styleSourceTab}
              onActiveTabChange={setStyleSourceTab}
              selectedPalette={paletteSelected}
              onPaletteChange={handlePaletteChange}
              onTemplateFill={(text, palette) => {
                onUserScriptChange(text);
                if (onOptimizedPromptEnChange) onOptimizedPromptEnChange("");
                if (palette) handlePaletteChange(palette);
                setShowStyleSource(true);
                setStyleSourceTab("templates");
              }}
              savedStyles={savedStyles}
              appliedStyle={selectedStyleInfo ? { id: selectedStyleId, ...selectedStyleInfo } : null}
              onApplyStyle={handleApplyStyle}
              onClearAppliedStyle={handleClearStyle}
              idPrefix="general-style-source"
            />

            {onSaveTemplate && (
              <section className="space-y-2 lg:rounded-xl lg:border lg:border-border/80 lg:bg-muted/35 lg:p-3 lg:shadow-inner" aria-labelledby="template-save-title">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <h3 id="template-save-title" className="text-xs font-semibold text-foreground">
                      範本與保存
                    </h3>
                    <p className="hidden text-xs text-muted-foreground lg:block">
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
                    <LayoutTemplate className="icon-sm" aria-hidden="true" />
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
          </div>
        </div>
      </Card>
    </div>
  );
}
