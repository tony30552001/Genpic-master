// Labels for the steps a storyboard agent job reports (api/_shared/videoStoryboardProgress.js).
export const STORYBOARD_STEP_LABELS = {
  reading: "讀取腳本文件",
  thinking: "AI 構思分鏡",
  writing: "AI 撰寫分鏡",
  checking: "檢查分鏡",
  images: "匯入參考圖",
};

export const shotCountLabel = (progress) => {
  const done = progress?.shots?.length ?? 0;
  if (progress?.expectedShots) return `${done}／${progress.expectedShots} 幕`;
  return done ? `${done} 幕` : "";
};
