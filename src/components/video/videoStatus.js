export const STATUS_LABELS = {
  drafting: "AI 正在整理鏡頭",
  queued: "排隊中",
  submitting: "送出中",
  polling: "生成中",
  storing: "轉存成品中",
  succeeded: "生成完成",
  failed: "生成失敗",
  cancelled: "已取消",
};

export const segmentStatusLabel = (segment) =>
  STATUS_LABELS[segment.phase] || STATUS_LABELS[segment.status] || STATUS_LABELS.queued;

export const hasSegmentGrid = (turn) => (turn?.segments?.length || 0) > 1;
export const isTerminal = (status) => ["succeeded", "failed", "cancelled"].includes(status);

export const playableSources = (turn) => {
  if (turn.mergeStatus === "merged") return [{ projectId: turn.projectId }];
  const sources = [];
  for (const segment of turn.segments || []) {
    if (segment.status !== "succeeded") break;
    sources.push({ jobId: segment.jobId });
  }
  return sources;
};
