import React from "react";
import { Upload, Palette, Wand2, Tag, Save, Loader2, X } from "lucide-react";

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
      <div className="flex items-center gap-2 text-slate-800 font-semibold">
        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">
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
          className={`border-2 border-dashed rounded-xl p-4 transition-all text-center ${
            referencePreview
              ? "border-indigo-300 bg-indigo-50"
              : "border-slate-300 hover:border-indigo-300 hover:bg-slate-50"
          }`}
        >
          {referencePreview ? (
            <div className="relative h-32 w-full">
              <img
                src={referencePreview}
                alt="Reference"
                className="h-full w-full object-contain rounded-md"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md pointer-events-none">
                <span className="text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
                  點擊更換
                </span>
              </div>
              <button
                onClick={onClearReference}
                className="absolute -top-2 -right-2 bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-200 rounded-full p-1.5 shadow-md z-20 transition-all transform hover:scale-110"
                title="移除圖片與風格"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="py-8 flex flex-col items-center text-slate-400">
              <Upload className="w-8 h-8 mb-2" />
              <span className="text-sm">點擊上傳或拖曳圖片</span>
              <span className="text-xs mt-1">支援 JPG, PNG</span>
            </div>
          )}
        </div>
      </div>

      {showProgress && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="text-xs text-slate-500">
            {isUploading ? "上傳中..." : "上傳完成"} {uploadProgress}%
          </div>
        </div>
      )}

      <button
        onClick={onAnalyze}
        disabled={!referencePreview || isAnalyzing || isUploading}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-sm"
      >
        {isAnalyzing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Palette className="w-4 h-4" />
        )}
        {isUploading
          ? "上傳中，請稍候..."
          : isAnalyzing
            ? "正在全方位分析..."
            : "解析風格與內容"}
      </button>

      {isAnalyzing && analysisPhase && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-indigo-900">
                {analysisPhase}
              </p>
              <div className="mt-2 h-1.5 w-full bg-indigo-200 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: analysisPhase.includes("儲存") ? "90%" : analysisPhase.includes("解析") ? "60%" : "30%" }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {analyzedStyle && (
        <div className="bg-white border border-indigo-100 rounded-xl p-4 shadow-sm space-y-3 animate-in fade-in slide-in-from-top-2 relative">
          <div className="flex items-start justify-between">
            <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
              <Wand2 className="w-4 h-4" />
              {analysisResultData?.style_name || "風格分析結果"}
            </h3>
            <button
              onClick={onClearStyle}
              className="text-slate-400 hover:text-slate-600"
              title="清除風格"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="text-xs leading-relaxed text-slate-600 bg-indigo-50/50 p-3 rounded-lg border border-indigo-50">
            {analysisResultData?.style_description_zh || analyzedStyle}
          </div>

          {analysisResultData?.suggested_tags && (
            <div className="flex flex-wrap gap-1">
              {analysisResultData.suggested_tags.map((tag, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5" /> {tag}
                </span>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={newStyleName}
                onChange={(e) => onStyleNameChange(e.target.value)}
                placeholder="為此風格命名..."
                className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5 focus:border-indigo-500 outline-none"
              />
              <button
                onClick={onSaveStyle}
                disabled={isSavingStyle}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                {isSavingStyle ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                收藏
              </button>
            </div>
            <input
              type="text"
              value={newStyleTags}
              onChange={(e) => onStyleTagsChange(e.target.value)}
              placeholder="標籤 (以逗號分隔)..."
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:border-indigo-500 outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
