import React from "react";
import { Layout, Monitor, Square, Smartphone, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

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
  hideGenerate = false,
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="script-input" className="text-sm font-semibold">
          劇情描述
        </Label>
        <p className="text-xs text-muted-foreground">
          描述你想生成的畫面內容，包含人物、場景、動作和氛圍。越詳細越好。
        </p>
      </div>

      <Textarea
        id="script-input"
        value={userScript}
        onChange={(e) => onUserScriptChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder="例如：一位穿著西裝的員工正在向團隊展示數據圖表，背景是現代化的辦公室，會議桌上擺著筆電和咖啡，氣氛積極向上..."
        className="min-h-[200px] md:min-h-[320px] resize-y text-sm"
      />

      <div className="text-xs text-muted-foreground text-right">
        {userScript.length} 字
      </div>

      {/* Legacy: 獨立使用時仍顯示比例/解析度/生成按鈕 */}
      {!hideGenerate && (
        <>
          <div className="flex gap-2 mb-2 p-1 bg-muted rounded-lg border border-border">
            {ASPECT_RATIOS.map((ratio) => (
              <button
                key={ratio.id}
                onClick={() => onAspectRatioChange(ratio.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md transition-all ${aspectRatio === ratio.id
                    ? "bg-background text-primary font-bold shadow-sm border border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  }`}
                title={ratio.label}
              >
                <ratio.icon className="w-3.5 h-3.5" />
                <span className="hidden xl:inline">{ratio.id}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">解析度</span>
            <div className="flex gap-2">
              {IMAGE_SIZES.map((size) => (
                <button
                  key={size.id}
                  onClick={() => onImageSizeChange(size.id)}
                  className={`px-2.5 py-1 rounded-md border text-xs transition-all ${imageSize === size.id
                      ? "bg-background text-primary font-semibold border-border shadow-sm"
                      : "text-muted-foreground border-transparent hover:text-foreground hover:bg-muted"
                    }`}
                  title={size.label}
                >
                  {size.label}
                </button>
              ))}
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
