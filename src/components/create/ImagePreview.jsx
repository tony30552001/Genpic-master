import React from "react";
import { Image as ImageIcon, Save, Download, Wand2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ShareToLineButton from "../share/ShareToLineButton";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  onDownload,
  user,
}) {
  return (
    <div className="relative flex flex-col items-center justify-center w-full h-full min-h-[500px] bg-slate-50/50 rounded-xl overflow-hidden group border border-slate-200/50">

      {/* 生成的圖片區域：加上 padding 確保底部不被遮擋 */}
      {generatedImage ? (
        <div className="absolute inset-0 w-full h-full overflow-y-auto custom-scrollbar">
          <div className="min-h-full w-full flex align-middle justify-center p-4 pb-[88px] relative z-10">
            <img
              src={generatedImage}
              alt="AI Generated"
              className="max-w-full lg:max-w-[85%] h-auto my-auto object-contain animate-in fade-in zoom-in-95 duration-500 shadow-xl"
            />
          </div>
        </div>
      ) : isGenerating ? (
        /* 生成中動畫 (shadcn/ui Skeleton) */
        <div className="absolute inset-4 p-4 pb-[88px] flex items-center justify-center">
          <Skeleton className="w-[85%] h-full max-h-[85%] rounded-xl opacity-60 relative overflow-hidden flex flex-col items-center justify-center gap-4">
            <div className="relative z-10 flex flex-col items-center justify-center gap-3 backdrop-blur-sm bg-white/40 p-6 rounded-2xl border border-white/50 shadow-sm">
              <div className="relative">
                <div className="w-12 h-12 rounded-full border-[3px] border-blue-100 border-t-blue-500 animate-spin" />
                <Wand2 className="w-5 h-5 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
              </div>
              <div className="flex flex-col items-center text-center">
                <p className="text-sm font-semibold tracking-wide text-blue-900/80 mb-0.5 animate-pulse">正在為您繪製構想...</p>
                <p className="text-[11px] text-blue-900/50">大約需要 5-10 秒鐘</p>
              </div>
            </div>
          </Skeleton>
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
