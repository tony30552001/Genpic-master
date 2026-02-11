import React from "react";
import { Image as ImageIcon, Save, Wand2 } from "lucide-react";

export default function ImagePreview({
  generatedImage,
  isGenerating,
  analyzedStyle,
  onDownload,
}) {
  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-200 flex flex-col min-h-[500px]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-500" />
          <span className="font-semibold text-slate-700">生成預覽</span>
        </div>
        {generatedImage && (
          <button
            onClick={onDownload}
            className="flex items-center gap-2 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
          >
            <Save className="w-3.5 h-3.5" /> 下載圖片
          </button>
        )}
      </div>

      <div className="flex-1 bg-slate-50 flex items-center justify-center p-8">
        {generatedImage ? (
          <img
            src={generatedImage}
            alt="AI Result"
            className="max-w-full max-h-[600px] object-contain shadow-lg rounded-lg animate-in fade-in zoom-in-95 duration-500"
          />
        ) : (
          <div className="text-center text-slate-400">
            {isGenerating ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Wand2 className="w-6 h-6 text-blue-500 animate-pulse" />
                  </div>
                </div>
                <p className="text-lg font-medium text-slate-600">正在繪製您的構想...</p>
                <p className="text-sm">這通常需要 5-10 秒鐘</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 opacity-50">
                <div className="w-32 h-32 bg-slate-200 rounded-full flex items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-slate-400" />
                </div>
                <p className="text-lg">請在左側面板上傳參考圖並輸入內容</p>
              </div>
            )}
          </div>
        )}
      </div>

      {generatedImage && analyzedStyle && (
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-xs text-slate-500">
          <p className="font-semibold mb-1 text-slate-700">使用風格：</p>
          <p className="line-clamp-2">{analyzedStyle}</p>
        </div>
      )}
    </div>
  );
}
