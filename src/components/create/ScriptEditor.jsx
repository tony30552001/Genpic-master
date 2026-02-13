import React, { useCallback, useEffect, useRef, useState } from "react";
import "./editorjs.css";
import EditorJS from "@editorjs/editorjs";
import Header from "@editorjs/header";
import List from "@editorjs/list";
import Delimiter from "@editorjs/delimiter";
import Marker from "@editorjs/marker";
import InlineCode from "@editorjs/inline-code";
import {
  Palette,
  PenLine,
  Sparkles,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Search,
  Image,
  Loader2,
  Wand2,
  Tag,
  Save,
} from "lucide-react";
import { optimizePrompt } from "../../services/aiService";

/**
 * ScriptEditor — 整合 Editor.js 的內容編輯器
 * 支援區塊式編輯、風格庫快速選取
 */
export default function ScriptEditor({
  userScript,
  onUserScriptChange,
  onFocus,
  onBlur,
  hideGenerate = false,
  // 新增：風格庫相關 props
  savedStyles = [],
  analyzedStyle,
  onApplyStyle,
  onClearStyle,
  // 新增：內容參考圖相關 props
  contentImagePreview,
  onContentImageUpload,
  onClearContentImage,
  isUploadingContent,
  // 風格分析 Props
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
}) {
  const [isDraging, setIsDraging] = useState(false);
  const fileInputRef = useRef(null);

  const editorRef = useRef(null);
  const holderRef = useRef(null);
  const isInitializing = useRef(false);
  const skipNextChange = useRef(false);
  const [showStylePicker, setShowStylePicker] = useState(false);
  const [styleSearch, setStyleSearch] = useState("");
  const [selectedStyleId, setSelectedStyleId] = useState(null);
  const [selectedStyleInfo, setSelectedStyleInfo] = useState(null);
  const [charCount, setCharCount] = useState(userScript?.length || 0);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // 將 Editor.js blocks 轉換為純文字
  const blocksToText = useCallback((blocks) => {
    return blocks
      .map((block) => {
        switch (block.type) {
          case "header":
            return block.data?.text || "";
          case "paragraph":
            return (block.data?.text || "").replace(/<[^>]+>/g, "");
          case "list": {
            const items = block.data?.items || [];
            return items
              .map((item) => {
                const text = typeof item === "string" ? item : item?.content || "";
                return `• ${text.replace(/<[^>]+>/g, "")}`;
              })
              .join("\n");
          }
          case "delimiter":
            return "---";
          default:
            return block.data?.text || "";
        }
      })
      .filter(Boolean)
      .join("\n\n");
  }, []);

  // 將純文字轉換為 Editor.js blocks
  const textToBlocks = useCallback((text) => {
    if (!text || !text.trim()) return [];

    const paragraphs = text.split(/\n\n+/);
    return paragraphs.map((p) => ({
      type: "paragraph",
      data: { text: p.replace(/\n/g, "<br>") },
    }));
  }, []);

  // 初始化 Editor.js
  useEffect(() => {
    if (!holderRef.current || isInitializing.current) return;
    isInitializing.current = true;

    const initEditor = async () => {
      // 如果已有 instance，先銷毀
      if (editorRef.current) {
        try {
          await editorRef.current.destroy();
        } catch (e) {
          // ignore
        }
        editorRef.current = null;
      }

      const editor = new EditorJS({
        holder: holderRef.current,
        placeholder: "描述你想生成的畫面內容...\n可用 / 選擇區塊類型，或直接打字",
        autofocus: false,
        minHeight: 120,
        tools: {
          header: {
            class: Header,
            inlineToolbar: true,
            config: {
              placeholder: "標題",
              levels: [2, 3],
              defaultLevel: 2,
            },
          },
          list: {
            class: List,
            inlineToolbar: true,
          },
          delimiter: Delimiter,
          marker: {
            class: Marker,
            shortcut: "CMD+SHIFT+M",
          },
          inlineCode: {
            class: InlineCode,
            shortcut: "CMD+SHIFT+C",
          },
        },
        data: {
          blocks: userScript ? textToBlocks(userScript) : [],
        },
        onChange: async (api) => {
          if (skipNextChange.current) {
            skipNextChange.current = false;
            return;
          }
          try {
            const data = await api.saver.save();
            const text = blocksToText(data.blocks);
            setCharCount(text.length);
            onUserScriptChange(text);
          } catch (e) {
            // ignore save errors during transitions
          }
        },
        onReady: () => {
          isInitializing.current = false;
        },
      });

      editorRef.current = editor;
    };

    initEditor();

    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.destroy();
        } catch (e) {
          // ignore
        }
        editorRef.current = null;
      }
      isInitializing.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 篩選風格
  const filteredStyles = savedStyles.filter((style) => {
    const q = styleSearch.toLowerCase();
    return (
      !q ||
      style.name.toLowerCase().includes(q) ||
      style.tags?.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  // 套用風格（不跳頁）
  const handleApplyStyle = (style) => {
    setSelectedStyleId(style.id);
    setSelectedStyleInfo({ name: style.name, tags: style.tags, previewUrl: style.previewUrl });
    onApplyStyle?.(style);
    setShowStylePicker(false);
  };

  // 清除風格
  const handleClearStyle = () => {
    setSelectedStyleId(null);
    setSelectedStyleInfo(null);
    onClearStyle?.();
  };

  // AI 智能優化
  const handleSmartOptimize = async () => {
    if (!userScript || !userScript.trim()) return;
    setIsOptimizing(true);
    try {
      // 1. 呼叫 API
      const result = await optimizePrompt({
        userScript,
        styleContext: analyzedStyle || selectedStyleInfo?.name || ""
      });

      if (result && result.optimizedPrompt) {
        const newText = result.optimizedPrompt;

        // 2. 更新 Editor.js 內容
        if (editorRef.current) {
          const newBlocks = textToBlocks(newText);
          await editorRef.current.render({ blocks: newBlocks });
        }

        // 3. 更新上層狀態
        onUserScriptChange(newText);
        setCharCount(newText.length);
      }
    } catch (err) {
      console.error("Smart optimize failed:", err);
      alert("優化失敗，請稍後再試。");
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* 標題與風格選取 */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
            <PenLine className="w-4 h-4 text-blue-500" />
            內容描述
          </label>
          <p className="text-xs text-slate-400">
            描述你想生成的畫面，包含人物、場景、動作和氛圍
          </p>
        </div>

        <button
          onClick={handleSmartOptimize}
          disabled={isOptimizing || !userScript?.trim()}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border
            ${!userScript?.trim()
              ? 'bg-slate-50 text-slate-300 border-slate-100 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white border-transparent shadow-sm hover:shadow-md hover:from-violet-600 hover:to-fuchsia-600'
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

      {/* 內容參考圖片區塊 */}
      <div className="space-y-2">
        {contentImagePreview ? (
          <div className="relative group rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
            <img
              src={contentImagePreview}
              alt="Content Reference"
              className="w-full h-48 object-contain bg-slate-100/50"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-start justify-end p-2 opacity-0 group-hover:opacity-100">
              <button
                onClick={onClearContentImage}
                className="p-1.5 bg-white text-slate-500 hover:text-red-500 rounded-full shadow-sm transition-colors"
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
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
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
              ${isUploadingContent ? 'bg-slate-100' : 'bg-blue-50 text-blue-500 group-hover:bg-blue-100 group-hover:text-blue-600'}
            `}>
              {isUploadingContent ? (
                <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
              ) : (
                <Image className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700 transition-colors">
                上傳內容參考圖片
              </p>
              <p className="text-xs text-slate-400">
                作為生成內容的視覺參考 (支援 JPG, PNG)
              </p>
            </div>
          </div>
        )}

        {/* 風格分析與結果顯示區 */}
        {contentImagePreview && (
          <div className="mt-2 space-y-3">
            {/* 分析按鈕 */}
            {!analyzedStyle && !analysisResultData && (
              <button
                onClick={onAnalyze}
                disabled={isAnalyzing || isUploadingContent}
                className="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-2 border border-blue-200"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
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

            {/* 分析結果卡片 (從 StyleAnalyzer 移植) */}
            {(analyzedStyle || analysisResultData) && (
              <div className="bg-white border border-blue-100 rounded-xl p-3 shadow-sm space-y-2 animate-in fade-in slide-in-from-top-2 relative">
                <div className="flex items-start justify-between">
                  <h3 className="font-bold text-blue-900 text-xs flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5" />
                    {analysisResultData?.style_name || "風格分析結果"}
                  </h3>
                  {/* 清除風格按鈕不需要在這裡，因為上方已經有清除個別風格的按鈕，或者是清除圖片時已經清除了 */}
                </div>

                <div className="text-[10px] leading-relaxed text-slate-600 bg-blue-50/50 p-2 rounded-lg border border-blue-50">
                  {analysisResultData?.style_description_zh || analyzedStyle}
                </div>

                {analysisResultData?.suggested_tags && (
                  <div className="flex flex-wrap gap-1">
                    {analysisResultData.suggested_tags.map((tag, i) => (
                      <span key={i} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-full flex items-center gap-1">
                        <Tag className="w-2.5 h-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 儲存風格介面 */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newStyleName || ''}
                      onChange={(e) => onStyleNameChange && onStyleNameChange(e.target.value)}
                      placeholder="為此風格命名..."
                      className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:border-blue-500 outline-none"
                    />
                    <button
                      onClick={onSaveStyle}
                      disabled={isSavingStyle}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
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
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 目前套用的風格 */}
      {(analyzedStyle || selectedStyleInfo) && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-100 rounded-lg">
          {selectedStyleInfo?.previewUrl && (
            <img src={selectedStyleInfo.previewUrl} alt="" className="w-8 h-8 rounded-md object-cover shrink-0 border border-blue-200" />
          )}
          <Palette className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-blue-700 line-clamp-1">
              {selectedStyleInfo?.name || '已套用風格'}
            </span>
            {selectedStyleInfo?.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {selectedStyleInfo.tags.slice(0, 4).map((tag, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-600 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleClearStyle}
            className="p-1 hover:bg-blue-100 text-blue-400 hover:text-blue-600 rounded-full transition-colors"
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
            className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-3 py-2 rounded-lg transition-all w-full justify-between"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              從風格庫選擇風格
              <span className="text-slate-400">({savedStyles.length})</span>
            </span>
            {showStylePicker ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* 風格選取下拉面板 */}
          {showStylePicker && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[320px] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200">
              {/* 搜尋 */}
              <div className="sticky top-0 bg-white border-b border-slate-100 px-3 py-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    placeholder="搜尋風格..."
                    value={styleSearch}
                    onChange={(e) => setStyleSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-blue-400 focus:ring-1 focus:ring-blue-400/30 outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>

              {/* 風格列表 */}
              <div className="overflow-y-auto flex-1 py-1">
                {filteredStyles.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400">
                    找不到符合的風格
                  </div>
                ) : (
                  filteredStyles.map((style) => (
                    <button
                      key={style.id}
                      onClick={() => handleApplyStyle(style)}
                      className={`w-full text-left px-3 py-2.5 hover:bg-blue-50 transition-colors flex items-start gap-3 ${selectedStyleId === style.id ? "bg-blue-50" : ""
                        }`}
                    >
                      {/* 縮圖 */}
                      {style.previewUrl ? (
                        <img
                          src={style.previewUrl}
                          alt=""
                          className="w-10 h-10 rounded-md object-cover shrink-0 border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-slate-100 shrink-0 flex items-center justify-center">
                          <Palette className="w-4 h-4 text-slate-300" />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-slate-700 truncate">
                            {style.name}
                          </span>
                          {selectedStyleId === style.id && (
                            <Check className="w-3 h-3 text-blue-500 shrink-0" />
                          )}
                        </div>
                        {style.tags && style.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {style.tags.slice(0, 3).map((tag, i) => (
                              <span
                                key={i}
                                className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full"
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

      {/* Editor.js 容器 — 乾淨無邊框排版 */}
      <div
        className="min-h-[240px] md:min-h-[360px] rounded-xl"
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <div
          ref={holderRef}
          id="editorjs-holder"
          className="editorjs-container py-3 pl-4 md:pl-24"
        />
      </div>

      {/* 字數統計 */}
      <div className="text-xs text-slate-400 text-right px-1">
        {charCount} 字
      </div>
    </div>
  );
}
