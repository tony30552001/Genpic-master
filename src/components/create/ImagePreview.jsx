import React from "react";
import { Image as ImageIcon, Save, Download, Wand2 } from "lucide-react";
import ShareToLineButton from "../share/ShareToLineButton";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  analyzedStyle,
  onDownload,
  user,
  message,
}) {
  return (
    <div className="relative flex items-center justify-center w-full h-full min-h-[200px] lg:min-h-[500px] bg-slate-100 rounded-xl overflow-y-auto overflow-x-hidden custom-scrollbar">
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
        <div className="relative my-auto flex-shrink-0 w-full flex items-center justify-center">
          <img
            src={generatedImage}
            alt="AI Generated"
            className="max-w-full my-auto object-contain animate-in fade-in zoom-in-95 duration-500"
            style={{ maxHeight: 'calc(100vh - 200px)' }}
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

          {/* 始終可見的按鈕 */}
          <div className="absolute bottom-3 right-3 z-10 flex flex-wrap justify-end items-center gap-2">
            <ShareToLineButton
              imageUrl={generatedImage}
              user={user}
              message={message}
              className="[&>button]:h-9 [&>button]:px-3 [&>button]:text-xs [&>button]:rounded-lg [&>button]:shadow-md"
            />
            <button
              onClick={onDownload}
              className="flex items-center h-9 gap-1.5 text-xs font-medium bg-white/90 backdrop-blur-sm hover:bg-white text-slate-700 px-3 py-2 rounded-lg transition-colors shadow-md border border-slate-200/50"
            >
              <Save className="w-3.5 h-3.5 shrink-0" /> <span className="whitespace-nowrap">下載圖片</span>
            </button>
          </div>

          {/* 風格資訊浮層 */}
          {analyzedStyle && (
            <div className="absolute bottom-3 left-3 z-10 max-w-[calc(100%-140px)] max-h-[80px] overflow-y-auto custom-scrollbar bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-md border border-slate-200/50">
              <p className="text-[10px] font-semibold text-slate-500 mb-0.5 sticky top-0 bg-white/90">使用風格</p>
              <p className="text-xs text-slate-700">{analyzedStyle}</p>
            </div>
          )}
        </div>
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
