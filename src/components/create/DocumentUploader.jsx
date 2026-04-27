import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Upload, X, FileType, Loader2,
  CheckCircle2, FileSearch, Brain, Sparkles, Clapperboard,
  ClipboardList, LayoutTemplate,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * 分析進度步驟定義
 * 每步有對應的 icon、標題、描述、預估時間佔比
 */
const ANALYSIS_STEPS_STORYBOARD = [
  {
    id: "upload",
    icon: Upload,
    title: "文件準備",
    description: "正在讀取並傳送文件…",
    weight: 10,
  },
  {
    id: "reading",
    icon: FileSearch,
    title: "內容解析",
    description: "AI 正在閱讀並理解文件內容…",
    weight: 30,
  },
  {
    id: "analyzing",
    icon: Brain,
    title: "智能分析",
    description: "提取敘事結構、角色和場景…",
    weight: 35,
  },
  {
    id: "generating",
    icon: Clapperboard,
    title: "生成分鏡",
    description: "組織場景、撰寫視覺 Prompt…",
    weight: 15,
  },
  {
    id: "done",
    icon: Sparkles,
    title: "完成",
    description: "分析結果已就緒！",
    weight: 5,
  },
];

const ANALYSIS_STEPS_PRESENTATION = [
  {
    id: "upload",
    icon: Upload,
    title: "文件準備",
    description: "正在讀取並傳送文件…",
    weight: 10,
  },
  {
    id: "reading",
    icon: FileSearch,
    title: "內容解析",
    description: "AI 正在閱讀並理解內容…",
    weight: 30,
  },
  {
    id: "analyzing",
    icon: Brain,
    title: "規劃投影片",
    description: "分析大綱結構、配置投影片佈局…",
    weight: 35,
  },
  {
    id: "generating",
    icon: LayoutTemplate,
    title: "設計投影片",
    description: "生成項目符號、配圖提示詞與講者備注…",
    weight: 15,
  },
  {
    id: "done",
    icon: Sparkles,
    title: "完成",
    description: "投影片結構已就緒！",
    weight: 5,
  },
];

/**
 * 根據經過時間與 analysisPhase 綜合判斷目前步驟
 * 時間驅動為主，keyword 為輔（解決 API 回應期間卡住問題）
 */
const getCurrentStepIndex = (phase, elapsedSeconds) => {
  // 若 analysisPhase 包含「整理」，表示 API 已回傳
  if (phase && phase.includes("整理")) return 3;
  // 上傳階段
  if (phase && (phase.includes("準備") || phase.includes("上傳"))) return 0;

  // AI 分析期間（長時間等待）以時間推進
  if (elapsedSeconds < 5) return 1;    // 內容解析
  if (elapsedSeconds < 15) return 2;   // 智能分析
  if (elapsedSeconds < 30) return 3;   // 生成分鏡
  return 3; // 超過 30 秒仍在第 3 步
};


/**
 * 分析進度面板
 */
function AnalysisProgress({ analysisPhase, fileName, mode = 'storyboard' }) {
  const steps = mode === 'presentation' ? ANALYSIS_STEPS_PRESENTATION : ANALYSIS_STEPS_STORYBOARD;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const startTimeRef = useRef(0);

  const currentStepIndex = getCurrentStepIndex(analysisPhase, elapsedSeconds);

  // 計時器
  useEffect(() => {
    startTimeRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsedSeconds(0);

    setSimulatedProgress(0);

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 模擬進度條 — 根據步驟和經過時間平滑推進
  useEffect(() => {
    // 計算基於步驟的最低進度
    let stepBaseProgress = 0;
    for (let i = 0; i < currentStepIndex; i++) {
      stepBaseProgress += steps[i].weight;
    }

    // 在當前步驟內根據時間慢慢推進（但不超越下一步的範圍）
    const currentWeight = steps[currentStepIndex]?.weight || 10;
    const withinStepProgress = Math.min(currentWeight * 0.8, elapsedSeconds * 1.2);
    const targetProgress = Math.min(95, stepBaseProgress + withinStepProgress);

    // 平滑動畫
    const animate = () => {
      setSimulatedProgress((prev) => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 0.5) return targetProgress;
        return prev + diff * 0.15;
      });
    };

    const rafId = requestAnimationFrame(animate);
    const intervalId = setInterval(animate, 100);

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(intervalId);
    };
  }, [currentStepIndex, elapsedSeconds, steps]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 py-4">
      {/* 檔案名稱 */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <FileText className="h-4 w-4" />
          {fileName}
        </div>
      </div>

      {/* 主要進度條 */}
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>分析進度</span>
          <span>{Math.round(simulatedProgress)}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out relative motion-reduce:transition-none"
            style={{
              width: `${simulatedProgress}%`,
              background: "hsl(var(--primary))",
            }}
          >
            {/* 光澤動畫 */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                animation: "shimmer 2s infinite",
              }}
            />
          </div>
        </div>
        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>已花費 {formatTime(elapsedSeconds)}</span>
          <span>預估剩餘 ~{formatTime(Math.max(0, Math.ceil((100 - simulatedProgress) / 3)))}</span>
        </div>
      </div>

      {/* 步驟列表 */}
      <div className="space-y-1">
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-500 ${isCurrent
                ? "bg-primary/5 border border-primary/20"
                : isCompleted
                  ? "opacity-70"
                  : "opacity-40"
                }`}
            >
              {/* 圖標 */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors duration-500 ${isCompleted
                  ? "bg-success/10 text-success"
                  : isCurrent
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                  }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : isCurrent ? (
                  <StepIcon className="h-4 w-4 animate-pulse" />
                ) : (
                  <StepIcon className="h-4 w-4" />
                )}
              </div>

              {/* 步驟文字 */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium transition-colors ${isCurrent ? "text-foreground" : isCompleted ? "text-muted-foreground" : "text-muted-foreground"
                    }`}
                >
                  {step.title}
                  {isCompleted && (
                    <span className="text-xs text-green-600 dark:text-green-400 ml-2">✓</span>
                  )}
                </p>
                {isCurrent && (
                  <p className="text-xs text-muted-foreground mt-0.5 animate-in fade-in duration-300">
                    {analysisPhase || step.description}
                  </p>
                )}
              </div>

              {/* 當前步驟的動畫指示器 */}
              {isCurrent && (
                <div className="flex gap-1 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 友善提示 */}
      <p className="text-center text-xs text-muted-foreground/70 pt-2">
        💡 文件越大分析時間越長，通常需要 15-45 秒
      </p>

      {/* 光澤動畫 CSS */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}

/**
 * 文件上傳與分析元件
 * 支援兩種輸入模式：
 *   - file: 上傳文件（分鏡/簡報皆可）
 *   - outline: 貼上文字大綱（自動使用簡報設計模式）
 */
export default function DocumentUploader({
  onAnalyze,
  isAnalyzing,
  analysisPhase,
  disabled = false,
}) {
  const [inputMode, setInputMode] = useState('file'); // 'file' | 'outline'
  const [selectedFile, setSelectedFile] = useState(null);
  const [outlineText, setOutlineText] = useState('');
  const [sceneCount, setSceneCount] = useState('auto');
  const [analysisMode, setAnalysisMode] = useState('storyboard'); // 'storyboard' | 'presentation'
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const supportedFormats = [
    { ext: "pdf", label: "PDF", color: "text-red-500" },
    { ext: "txt", label: "Text", color: "text-gray-500" },
    { ext: "md", label: "Markdown", color: "text-gray-500" },
    { ext: "png", label: "PNG", color: "text-green-500" },
    { ext: "jpg", label: "JPG", color: "text-green-500" },
  ];

  const handleFile = useCallback((file) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("檔案大小超過 50MB 限制");
      return;
    }
    const supportedExtensions = ["pdf", "txt", "md", "png", "jpg", "jpeg"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(ext)) {
      alert("不支援的檔案格式。請上傳 PDF、TXT 或圖片檔案。");
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const clearFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = async () => {
    if (inputMode === 'outline') {
      const trimmed = outlineText.trim();
      if (!trimmed) return;
      // 將文字大綱包裝成 File 物件（text/plain），強制使用簡報模式
      const blob = new Blob([trimmed], { type: 'text/plain' });
      const file = new File([blob], 'outline.txt', { type: 'text/plain' });
      try {
        await onAnalyze(file, sceneCount, 'presentation');
      } catch {
        // 錯誤已在父層處理
      }
    } else {
      if (!selectedFile) return;
      try {
        await onAnalyze(selectedFile, sceneCount, analysisMode);
      } catch {
        // 錯誤已在父層處理
      }
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileName) => {
    const ext = fileName.split(".").pop().toLowerCase();
    switch (ext) {
      case "pdf": return <FileText className="h-8 w-8 text-red-500" />;
      case "png": case "jpg": case "jpeg": return <FileType className="h-8 w-8 text-green-500" />;
      default: return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  // ──────── 分析中：顯示精美的進度面板 ────────
  if (isAnalyzing) {
    return (
      <div className="space-y-4">
        <div className="border-2 border-primary/30 rounded-lg p-6 bg-primary/5">
          <AnalysisProgress
            analysisPhase={analysisPhase}
            fileName={inputMode === 'outline' ? '簡報大綱' : (selectedFile?.name || "文件")}
            mode={inputMode === 'outline' ? 'presentation' : analysisMode}
          />
        </div>
      </div>
    );
  }

  // ──────── 正常狀態：上傳 UI ────────
  return (
    <Tabs value={inputMode} onValueChange={setInputMode}>
      {/* 輸入模式切換 */}
      <TabsList className="w-full">
        <TabsTrigger value="file" className="flex-1 gap-2" disabled={disabled}>
          <Upload className="h-4 w-4" />
          上傳文件
        </TabsTrigger>
        <TabsTrigger value="outline" className="flex-1 gap-2" disabled={disabled}>
          <ClipboardList className="h-4 w-4" />
          貼上大綱
        </TabsTrigger>
      </TabsList>

      {/* ── 文件上傳模式 ── */}
      <TabsContent value="file" className="space-y-4">
        {/* 上傳區域 */}
        <div
          className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${
            dragActive
              ? "border-primary/50 bg-primary/5"
              : selectedFile
                ? "border-green-500/50 bg-green-50 dark:bg-green-950/10"
                : "border-border hover:border-primary/40"
          } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !disabled && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleChange}
            accept=".pdf,.txt,.md,.png,.jpg,.jpeg"
            disabled={disabled}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            {selectedFile ? (
              <div className="flex items-center space-x-4">
                {getFileIcon(selectedFile.name)}
                <div className="text-left">
                  <p className="font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <Upload className="h-12 w-12 text-muted-foreground/50" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">點擊或拖曳檔案至此處</p>
                  <p className="text-xs text-muted-foreground mt-1">支援 PDF、文字檔案與圖片</p>
                  <p className="text-xs text-muted-foreground/60">最大 50MB</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 支援格式標籤 */}
        {!selectedFile && (
          <div className="flex flex-wrap gap-2 justify-center">
            {supportedFormats.map((format) => (
              <span
                key={format.ext}
                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"
              >
                {format.label}
              </span>
            ))}
          </div>
        )}

        {/* 分析設定 + 按鈕 */}
        {selectedFile && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              {/* 分析模式 */}
              <div className="flex items-center gap-2">
                <Label htmlFor="analysis-mode" className="text-sm font-medium whitespace-nowrap">分析模式</Label>
                <select
                  id="analysis-mode"
                  value={analysisMode}
                  onChange={(e) => setAnalysisMode(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  disabled={disabled}
                >
                  <option value="storyboard">分鏡腳本（AI 圖像）</option>
                  <option value="presentation">簡報設計（PowerPoint）</option>
                </select>
              </div>
              {/* 場景數量 */}
              <div className="flex items-center gap-2">
                <Label htmlFor="file-scene-count" className="text-sm font-medium whitespace-nowrap">
                  {analysisMode === 'presentation' ? '投影片數' : '分鏡數量'}
                </Label>
                <select
                  id="file-scene-count"
                  value={sceneCount}
                  onChange={(e) => setSceneCount(e.target.value)}
                  className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  disabled={disabled}
                >
                  <option value="auto">自動（AI 決定）</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>{n} 個</option>
                  ))}
                </select>
              </div>
            </div>
            <Button onClick={handleAnalyze} disabled={disabled} className="w-full">
              {analysisMode === 'presentation' ? (
                <><LayoutTemplate className="h-4 w-4 mr-2" />設計簡報投影片</>
              ) : (
                <><FileText className="h-4 w-4 mr-2" />分析文件並提取場景</>
              )}
            </Button>
          </div>
        )}
      </TabsContent>

      {/* ── 大綱文字輸入模式 ── */}
      <TabsContent value="outline" className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="outline-textarea" className="text-sm font-medium flex items-center gap-1.5">
            <LayoutTemplate className="h-3.5 w-3.5 text-primary" />
            簡報大綱
          </Label>
          <Textarea
            id="outline-textarea"
            value={outlineText}
            onChange={(e) => setOutlineText(e.target.value)}
            placeholder={"貼上或輸入你的簡報大綱，例如：\n\n主題：AI 在醫療產業的應用\n\n一、前言\n- AI 技術快速發展\n- 醫療需求龐大\n\n二、當前挑戰\n- 人力不足\n- 診斷錯誤率\n\n三、AI 解決方案\n- 影像辨識診斷\n- 藥物研發加速\n\n四、成功案例\n…\n\n五、結語"}
            className="h-52 resize-none leading-relaxed"
            disabled={disabled}
          />
          <p className="text-xs text-muted-foreground">
            AI 將自動將大綱轉換為投影片結構，並生成每張投影片的重點與配圖提示詞。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="outline-scene-count" className="text-sm font-medium whitespace-nowrap">投影片數</Label>
          <select
            id="outline-scene-count"
            value={sceneCount}
            onChange={(e) => setSceneCount(e.target.value)}
            className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            disabled={disabled}
          >
            <option value="auto">自動（AI 決定）</option>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>{n} 張</option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleAnalyze}
          disabled={disabled || !outlineText.trim()}
          className="w-full"
        >
          <LayoutTemplate className="h-4 w-4 mr-2" />
          AI 設計簡報投影片
        </Button>
      </TabsContent>
    </Tabs>
  );
}
