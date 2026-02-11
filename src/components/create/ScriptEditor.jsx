import React from "react";
import { Layout, Monitor, Square, Smartphone, Wand2 } from "lucide-react";

const ASPECT_RATIOS = [
  { id: "16:9", label: "16:9 簡報", icon: Monitor },
  { id: "4:3", label: "4:3 傳統", icon: Layout },
  { id: "1:1", label: "1:1 社群", icon: Square },
  { id: "9:16", label: "9:16 手機", icon: Smartphone },
];

const IMAGE_SIZES = [
  { id: "1K", label: "1K" },
  { id: "2K", label: "2K" },
  { id: "4K", label: "4K" },
];

export default function ScriptEditor({
  userScript,
  onUserScriptChange,
  onFocus,
  onBlur,
  aspectRatio,
  onAspectRatioChange,
  imageSize,
  onImageSizeChange,
  isGenerating,
  onGenerate,
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-slate-800 font-semibold">
        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">
          2
        </div>
        輸入內容劇情與規格
      </div>

      <div className="flex gap-2 mb-2 p-1 bg-slate-50 rounded-lg border border-slate-200">
        {ASPECT_RATIOS.map((ratio) => (
          <button
            key={ratio.id}
            onClick={() => onAspectRatioChange(ratio.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-all ${
              aspectRatio === ratio.id
                ? "bg-white text-indigo-600 font-bold shadow-sm border border-slate-200"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
            }`}
            title={ratio.label}
          >
            <ratio.icon className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">{ratio.id}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">解析度</span>
        <div className="flex gap-2">
          {IMAGE_SIZES.map((size) => (
            <button
              key={size.id}
              onClick={() => onImageSizeChange(size.id)}
              className={`px-2.5 py-1 rounded-md border text-xs transition-all ${
                imageSize === size.id
                  ? "bg-white text-indigo-600 font-semibold border-slate-200 shadow-sm"
                  : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-100"
              }`}
              title={size.label}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={userScript}
        onChange={(e) => onUserScriptChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="例如：一位穿著西裝的員工正在向團隊展示數據圖表，背景是現代化的辦公室，氣氛積極向上..."
        className="w-full h-32 md:h-64 p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-y bg-white transition-all"
      />

      <button
        onClick={onGenerate}
        disabled={!userScript || isGenerating}
        className="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-slate-300 disabled:to-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 transform active:scale-[0.98]"
      >
        {isGenerating ? (
          <span className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 animate-spin" /> AI 生成中...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" /> 開始生成圖片
          </span>
        )}
      </button>
    </div>
  );
}
