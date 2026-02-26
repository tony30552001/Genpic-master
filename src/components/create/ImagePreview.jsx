import React from "react";
import { Image as ImageIcon, Save, Download, Wand2 } from "lucide-react";
import ShareToLineButton from "../share/ShareToLineButton";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  onDownload,
  user,
}) {
  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full min-h-[500px] bg-slate-100 rounded-xl overflow-hidden group">
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

      {/* 生成的圖片區域：加上 padding 確保底部不被遮擋 */}
      {generatedImage ? (
        <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar">
          <div className="min-h-full w-full flex items-center justify-center p-8 pb-[88px]">
            <img
              src={generatedImage}
              alt="AI Generated"
              className="max-w-full lg:max-w-[85%] h-auto object-contain animate-in fade-in zoom-in-95 duration-500 shadow-xl"
            />
          </div>
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

      {/* 獨立出來不受圖片滾動影響的按鈕層：固定在整個容器最上方的一層右下方，而不是跟隨圖片滾動 */}
      {generatedImage && (
        <div className="absolute bottom-4 right-4 z-20 flex flex-wrap justify-end items-center gap-2 drop-shadow-md">
          <ShareToLineButton
            imageUrl={generatedImage}
            user={user}
            className="[&>button]:h-10 [&>button]:px-4 [&>button]:text-sm [&>button]:rounded-lg [&>button]:shadow-lg"
          />
          <button
            onClick={onDownload}
            className="flex items-center h-10 gap-1.5 text-sm font-medium bg-white/90 backdrop-blur-sm hover:bg-white text-slate-700 px-4 py-2 rounded-lg transition-colors shadow-lg border border-slate-200/50"
          >
            <Save className="w-4 h-4 shrink-0" /> <span className="whitespace-nowrap">下載圖片</span>
          </button>
        </div>
      )}
    </div>
  );
}
