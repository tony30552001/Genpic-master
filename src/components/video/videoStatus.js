export const STATUS_LABELS = {
  drafting: "AI 正在整理鏡頭",
  queued: "排隊中",
  submitting: "送出中",
  polling: "生成中",
  storing: "轉存成品中",
  succeeded: "生成完成",
  failed: "生成失敗",
};

export const segmentStatusLabel = (segment) =>
  STATUS_LABELS[segment.phase] || STATUS_LABELS[segment.status] || STATUS_LABELS.queued;

/** Whether a turn's segments can be shown one card each (several, not yet merged). */
export const hasSegmentGrid = (turn) => (turn?.segments?.length || 0) > 1 && turn.mergeStatus !== "merged";
