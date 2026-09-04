const GENERATION_PHASES = [
  {
    maxSeconds: 3,
    phase: "preparing",
    label: "正在準備生成請求",
    shortLabel: "準備生成中",
    helperText: "正在整理提示詞與輸出設定。",
    progressStart: 8,
    progressEnd: 18,
  },
  {
    maxSeconds: 10,
    phase: "submitted",
    label: "已送出生成請求",
    shortLabel: "已送出請求",
    helperText: "正在等待 GPT Image 2 開始回傳結果。",
    progressStart: 18,
    progressEnd: 34,
  },
  {
    maxSeconds: 30,
    phase: "composing",
    label: "AI 正在建立構圖",
    shortLabel: "建立構圖中",
    helperText: "高品質圖片通常需要較久，請保持此頁開啟。",
    progressStart: 34,
    progressEnd: 64,
  },
  {
    maxSeconds: 60,
    phase: "refining",
    label: "AI 正在精修細節",
    shortLabel: "精修細節中",
    helperText: "正在處理文字、版面與視覺細節。",
    progressStart: 64,
    progressEnd: 86,
  },
  {
    maxSeconds: Infinity,
    phase: "waiting",
    label: "仍在等待模型回傳",
    shortLabel: "仍在生成中",
    helperText: "你可以繼續等待，或取消後調整提示詞再試一次。",
    progressStart: 86,
    progressEnd: 95,
  },
];

export const formatElapsedSeconds = (seconds = 0) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) return `${remainingSeconds}s`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

export const getGenerationStatus = ({ elapsedSeconds = 0 } = {}) => {
  const safeElapsed = Math.max(0, Math.floor(elapsedSeconds));
  let elapsedBeforePhase = 0;
  let currentPhase = GENERATION_PHASES[GENERATION_PHASES.length - 1];

  for (const phase of GENERATION_PHASES) {
    if (safeElapsed < phase.maxSeconds) {
      currentPhase = phase;
      break;
    }
    elapsedBeforePhase = phase.maxSeconds;
  }

  const phaseDuration = Number.isFinite(currentPhase.maxSeconds)
    ? Math.max(1, currentPhase.maxSeconds - elapsedBeforePhase)
    : 60;
  const phaseElapsed = Math.max(0, safeElapsed - elapsedBeforePhase);
  const phaseRatio = Math.min(1, phaseElapsed / phaseDuration);
  const progress = Math.min(
    95,
    Math.round(currentPhase.progressStart + (currentPhase.progressEnd - currentPhase.progressStart) * phaseRatio)
  );

  return {
    phase: currentPhase.phase,
    label: currentPhase.label,
    shortLabel: currentPhase.shortLabel,
    helperText: currentPhase.helperText,
    progress,
    elapsedSeconds: safeElapsed,
    elapsedLabel: formatElapsedSeconds(safeElapsed),
    waitLevel: safeElapsed >= 60 ? "extended" : safeElapsed >= 30 ? "slow" : "normal",
  };
};
