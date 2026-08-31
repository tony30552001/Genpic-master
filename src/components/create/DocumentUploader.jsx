import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  X,
} from "@/components/icons/lucideControls";
import {
  CheckCircle2,
} from "@/components/icons/lucideStatus";
import {
  FileText,
  FileType,
  Clock3,
  FileSearch,
  Brain,
  Sparkles,
  Clapperboard,
} from "@/components/icons/lucideContent";
import ProductGlyph from "@/components/icons/ProductGlyph";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_FORMAT_GROUPS,
  MAX_DOCUMENT_FILE_SIZE,
  isSupportedDocumentFile,
} from "@/lib/documentFormats";

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
    description: "提取敘事結構、角色、場景並判斷視覺方向…",
    weight: 35,
  },
  {
    id: "generating",
    icon: Clapperboard,
    title: "生成分鏡與風格",
    description: "組織場景、撰寫視覺 Prompt 並推薦文件風格…",
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
function AnalysisProgress({ analysisPhase, fileName }) {
  const steps = ANALYSIS_STEPS_STORYBOARD;
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

  const progressValue = Math.round(simulatedProgress);

  return (
    <section
      aria-label="文件分鏡進度"
      aria-live="polite"
      className="w-full max-w-2xl mx-auto overflow-hidden rounded-[26px] border border-border/70 bg-background/95 shadow-[0_24px_70px_-38px_hsl(var(--primary)/0.45)] dark:bg-card/80"
    >
      <div className="p-5 sm:p-7">
        {/* 標題與目前狀態 */}
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <ProductGlyph kind="document" active className="h-10 w-10 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <span>分鏡分析</span>
                <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
                <span className="inline-flex items-center gap-1.5 text-primary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                  處理中
                </span>
              </div>
              <h2 className="mt-1.5 truncate text-lg font-semibold tracking-[-0.02em] text-foreground sm:text-xl">
                正在整理你的內容
              </h2>
              <p className="mt-1 max-w-[34rem] truncate text-sm text-muted-foreground" title={fileName}>
                {fileName}
              </p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-mono text-2xl font-semibold tabular-nums tracking-[-0.06em] text-foreground">
              {progressValue}%
            </p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              進度
            </p>
          </div>
        </header>

        {/* 主要進度條 */}
        <div className="mt-7">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/80">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${simulatedProgress}%` }}
            />
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-4 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">已花費 {formatTime(elapsedSeconds)}</span>
            <span className="text-right">預估剩餘 ~{formatTime(Math.max(0, Math.ceil((100 - simulatedProgress) / 3)))}</span>
          </div>
        </div>

        {/* 分析工作流 */}
        <div className="mt-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              工作流程
            </p>
            <p className="font-mono text-xs tabular-nums text-muted-foreground">
              {Math.min(currentStepIndex + 1, steps.length)} / {steps.length}
            </p>
          </div>

          <ol className="mt-3 space-y-1" aria-label="分析步驟">
            {steps.map((step, idx) => {
              const StepIcon = step.icon;
              const isCompleted = idx < currentStepIndex;
              const isCurrent = idx === currentStepIndex;

              return (
                <li
                  key={step.id}
                  className={`relative flex gap-3 rounded-2xl px-3 py-3 transition-[background-color,opacity] duration-500 ${
                    isCurrent
                      ? "bg-primary/[0.055] ring-1 ring-primary/15"
                      : isCompleted
                        ? "bg-success/[0.035]"
                        : "opacity-45"
                  }`}
                >
                  <div className="relative flex w-8 shrink-0 justify-center">
                    <div
                      className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-500 ${
                        isCompleted
                          ? "bg-success/10 text-success"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-sm shadow-primary/25"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="icon-sm" aria-hidden="true" />
                      ) : (
                        <StepIcon className={`h-4 w-4 ${isCurrent ? "animate-pulse" : ""}`} aria-hidden="true" />
                      )}
                    </div>
                    {idx < steps.length - 1 && (
                      <span
                        className={`absolute left-1/2 top-8 h-[calc(100%+0.25rem)] w-px -translate-x-1/2 ${
                          isCompleted ? "bg-success/25" : "bg-border/70"
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <p
                        className={`text-sm font-semibold tracking-[-0.01em] ${
                          isCurrent || isCompleted ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {step.title}
                      </p>
                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-primary">
                          <span className="h-1 w-1 rounded-full bg-primary" aria-hidden="true" />
                          進行中
                        </span>
                      )}
                    </div>
                    {isCurrent && (
                      <p className="mt-1 text-xs leading-5 text-muted-foreground animate-in fade-in duration-300">
                        {analysisPhase || step.description}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* 友善提示 */}
        <div className="mt-6 flex items-start gap-2.5 border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">
          <Clock3 className="mt-0.5 icon-sm shrink-0 text-primary/70" aria-hidden="true" />
          <p>大多數文件會在 15–45 秒內完成，文件越大所需時間越長。</p>
        </div>
      </div>
    </section>
  );
}

/**
 * 文件上傳與分鏡分析元件
 */
export default function DocumentUploader({
  onAnalyze,
  isAnalyzing,
  analysisPhase,
  disabled = false,
}) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [itemCount, setItemCount] = useState('auto');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (file.size > MAX_DOCUMENT_FILE_SIZE) {
      alert("檔案大小超過 50MB 限制");
      return;
    }
    if (!isSupportedDocumentFile(file)) {
      alert(
        "不支援的檔案格式。請上傳 PDF、Office、OpenDocument、RTF、EPUB、CSV、文字或圖片檔案。"
      );
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
    if (!selectedFile) return;
    try {
      await onAnalyze(selectedFile, itemCount);
    } catch {
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
      case "pdf": return <FileText className="icon-display text-red-500" />;
      case "png": case "jpg": case "jpeg": return <FileType className="icon-display text-green-500" />;
      default: return <FileText className="icon-display text-gray-500" />;
    }
  };

  // ──────── 分析中：顯示精美的進度面板 ────────
  if (isAnalyzing) {
    return (
      <div className="py-2 sm:py-6">
        <AnalysisProgress
          analysisPhase={analysisPhase}
          fileName={selectedFile?.name || "文件"}
        />
      </div>
    );
  }

  // ──────── 正常狀態：上傳 UI ────────
  return (
    <div className="space-y-4">
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
          accept={DOCUMENT_ACCEPT}
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
                <X className="icon-sm" />
              </Button>
            </div>
          ) : (
            <>
              <Upload className="icon-display text-muted-foreground/50" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">點擊或拖曳檔案至此處</p>
                <p className="text-xs text-muted-foreground mt-1">
                  支援 PDF、Office、OpenDocument、文字與圖片
                </p>
                <p className="text-xs text-muted-foreground/60">最大 50MB</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 支援格式標籤 */}
      {!selectedFile && (
        <div className="flex flex-wrap gap-2 justify-center">
          {DOCUMENT_FORMAT_GROUPS.map((format) => (
            <span
              key={format}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground"
            >
              {format}
            </span>
          ))}
        </div>
      )}

      {/* 分析設定 + 按鈕 */}
      {selectedFile && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            {/* 內容頁數量 */}
            <div className="flex items-center gap-2">
              <Label htmlFor="file-item-count" className="text-sm font-medium whitespace-nowrap">
                分鏡數量
              </Label>
              <select
                id="file-item-count"
                value={itemCount}
                onChange={(e) => setItemCount(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                disabled={disabled}
              >
                <option value="auto">自動（AI 決定）</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} 個
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={handleAnalyze} disabled={disabled} className="w-full">
            <ProductGlyph kind="document" active className="icon-sm mr-2" aria-hidden="true" />
            分析文件並提取場景
          </Button>
        </div>
      )}
    </div>
  );
}
