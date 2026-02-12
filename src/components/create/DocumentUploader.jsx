import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileText, Upload, X, FileType, Loader2,
  CheckCircle2, FileSearch, Brain, Sparkles, Clapperboard,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * 分析進度步驟定義
 * 每步有對應的 phase 關鍵字、icon、標題、描述、預估時間佔比
 */
const ANALYSIS_STEPS = [
  {
    id: "upload",
    keywords: ["準備", "上傳"],
    icon: Upload,
    title: "文件準備",
    description: "正在讀取並傳送文件...",
    weight: 10,
  },
  {
    id: "reading",
    keywords: ["AI 正在分析"],
    icon: FileSearch,
    title: "內容解析",
    description: "AI 正在閱讀並理解文件內容...",
    weight: 35,
  },
  {
    id: "analyzing",
    keywords: [],
    icon: Brain,
    title: "智能分析",
    description: "提取敘事結構、角色和場景...",
    weight: 35,
  },
  {
    id: "generating",
    keywords: ["整理"],
    icon: Clapperboard,
    title: "生成分鏡",
    description: "組織場景、撰寫視覺 Prompt...",
    weight: 15,
  },
  {
    id: "done",
    keywords: [],
    icon: Sparkles,
    title: "完成",
    description: "分析結果已就緒！",
    weight: 5,
  },
];

/**
 * 根據 analysisPhase 文字判斷目前步驟
 */
const getCurrentStepIndex = (phase) => {
  if (!phase) return 0;
  for (let i = ANALYSIS_STEPS.length - 1; i >= 0; i--) {
    const step = ANALYSIS_STEPS[i];
    if (step.keywords.some((kw) => phase.includes(kw))) return i;
  }
  return 1; // 預設為讀取步驟
};

/**
 * 分析進度面板
 */
function AnalysisProgress({ analysisPhase, fileName }) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const startTimeRef = useRef(Date.now());

  const currentStepIndex = getCurrentStepIndex(analysisPhase);

  // 計時器
  useEffect(() => {
    startTimeRef.current = Date.now();
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
      stepBaseProgress += ANALYSIS_STEPS[i].weight;
    }

    // 在當前步驟內根據時間慢慢推進（但不超越下一步的範圍）
    const currentWeight = ANALYSIS_STEPS[currentStepIndex]?.weight || 10;
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
  }, [currentStepIndex, elapsedSeconds]);

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
            className="h-full rounded-full transition-all duration-500 ease-out relative"
            style={{
              width: `${simulatedProgress}%`,
              background: "linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)",
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
        {ANALYSIS_STEPS.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < currentStepIndex;
          const isCurrent = idx === currentStepIndex;
          const isPending = idx > currentStepIndex;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-500 ${isCurrent
                  ? "bg-primary/5 border border-primary/20"
                  : isCompleted
                    ? "opacity-70"
                    : "opacity-40"
                }`}
            >
              {/* 圖標 */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${isCompleted
                    ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
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
 */
export default function DocumentUploader({
  onAnalyze,
  isAnalyzing,
  analysisPhase,
  disabled = false,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const supportedFormats = [
    { ext: "pdf", label: "PDF", color: "text-red-500" },
    { ext: "docx", label: "Word", color: "text-blue-500" },
    { ext: "pptx", label: "PowerPoint", color: "text-orange-500" },
    { ext: "txt", label: "Text", color: "text-gray-500" },
    { ext: "md", label: "Markdown", color: "text-gray-500" },
    { ext: "png", label: "PNG", color: "text-green-500" },
    { ext: "jpg", label: "JPG", color: "text-green-500" },
  ];

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
  }, []);

  const handleChange = useCallback((e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const handleFile = (file) => {
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      alert("檔案大小超過 50MB 限制");
      return;
    }
    const supportedExtensions = ["pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg"];
    const ext = file.name.split(".").pop().toLowerCase();
    if (!supportedExtensions.includes(ext)) {
      alert("不支援的檔案格式。請上傳 PDF、DOCX、PPTX、TXT 或圖片檔案。");
      return;
    }
    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    try {
      await onAnalyze(selectedFile);
    } catch (err) {
      // 錯誤已在父層處理
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
      case "docx": case "doc": return <FileText className="h-8 w-8 text-blue-500" />;
      case "pptx": case "ppt": return <FileText className="h-8 w-8 text-orange-500" />;
      case "png": case "jpg": case "jpeg": return <FileType className="h-8 w-8 text-green-500" />;
      default: return <FileText className="h-8 w-8 text-gray-500" />;
    }
  };

  // ──────── 分析中：顯示精美的進度面板 ────────
  if (isAnalyzing) {
    return (
      <div className="space-y-4">
        <div className="border-2 border-primary/30 rounded-lg p-6 bg-gradient-to-br from-primary/5 via-background to-blue-50/50 dark:to-blue-950/20">
          <AnalysisProgress
            analysisPhase={analysisPhase}
            fileName={selectedFile?.name || "文件"}
          />
        </div>
      </div>
    );
  }

  // ──────── 正常狀態：上傳 UI ────────
  return (
    <div className="space-y-4">
      {/* 上傳區域 */}
      <div
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors ${dragActive
            ? "border-blue-500 bg-blue-50"
            : selectedFile
              ? "border-green-500 bg-green-50"
              : "border-slate-300 hover:border-slate-400"
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
          accept=".pdf,.docx,.pptx,.txt,.md,.png,.jpg,.jpeg"
          disabled={disabled}
        />

        <div className="flex flex-col items-center justify-center space-y-3">
          {selectedFile ? (
            <div className="flex items-center space-x-4">
              {getFileIcon(selectedFile.name)}
              <div className="text-left">
                <p className="font-medium text-slate-900">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
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
              <Upload className="h-12 w-12 text-slate-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">點擊或拖曳檔案至此處</p>
                <p className="text-xs text-slate-500 mt-1">支援 PDF、Word、PowerPoint、文字檔案與圖片</p>
                <p className="text-xs text-slate-400">最大 50MB</p>
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
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600"
            >
              {format.label}
            </span>
          ))}
        </div>
      )}

      {/* 分析按鈕 */}
      {selectedFile && (
        <Button onClick={handleAnalyze} disabled={disabled} className="w-full">
          <FileText className="h-4 w-4 mr-2" />
          分析文件並提取場景
        </Button>
      )}
    </div>
  );
}
