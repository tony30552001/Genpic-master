import React from "react";
import { Image as ImageIcon, Save, Download, Wand2 } from "lucide-react";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  analyzedStyle,
  onDownload,
}) {
  return (
    <div className="relative flex items-center justify-center w-full h-full min-h-[500px] bg-slate-100 rounded-xl overflow-hidden">
      {/* 棋盤格背景（透明度指示） */}
      {!generatedImage && !isGenerating && (
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #94a3b8 25%, transparent 25%), linear-gradient(-45deg, #94a3b8 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #94a3b8 75%), linear-gradient(-45deg, transparent 75%, #94a3b8 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
          }}
        />
      )}

      {/* 生成的圖片 — 直接滿版顯示 */}
      {generatedImage ? (
        <>
          <img
            src={generatedImage}
            alt="AI Generated"
            className="max-w-full max-h-full object-contain animate-in fade-in zoom-in-95 duration-500"
          />

          {/* 浮動工具列 — hover 時顯示 */}
          <div className="absolute top-3 right-3 flex gap-2 opacity-0 hover:opacity-100 transition-opacity duration-300 group-hover:opacity-100">
            <button
              onClick={onDownload}
              className="flex items-center gap-1.5 text-xs font-medium bg-black/60 backdrop-blur-sm hover:bg-black/80 text-white px-3 py-2 rounded-lg transition-colors shadow-lg"
            >
              <Download className="w-3.5 h-3.5" /> 下載
            </button>
          </div>

          {/* 始終可見的下載按鈕（小型） */}
          <button
            onClick={onDownload}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 text-xs font-medium bg-white/90 backdrop-blur-sm hover:bg-white text-slate-700 px-3 py-2 rounded-lg transition-colors shadow-md border border-slate-200/50"
          >
            <Save className="w-3.5 h-3.5" /> 下載圖片
          </button>

          {/* 風格資訊浮層 */}
          {analyzedStyle && (
            <div className="absolute bottom-3 left-3 max-w-[60%] bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-slate-200/50">
              <p className="text-[10px] font-semibold text-slate-500 mb-0.5">使用風格</p>
              <p className="text-xs text-slate-700 line-clamp-2">{analyzedStyle}</p>
            </div>
          )}
        </>
      ) : isGenerating ? (
        /* 生成中動畫 */
        <div className="flex flex-col items-center gap-4 text-slate-400">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Wand2 className="w-6 h-6 text-blue-500 animate-pulse" />
            </div>
          </div>
          <p className="text-lg font-medium text-slate-600">正在繪製您的構想...</p>
          <p className="text-sm">這通常需要 5-10 秒鐘</p>
        </div>
      ) : (
        /* 空白狀態 */
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="w-20 h-20 bg-slate-200/60 rounded-2xl flex items-center justify-center">
            <ImageIcon className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-sm text-slate-400">請在左側面板上傳參考圖並輸入內容</p>
        </div>
      )}
    </div>
  );
}
