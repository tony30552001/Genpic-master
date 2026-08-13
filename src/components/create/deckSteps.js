/**
 * 把伺服器的事件流轉成可渲染的步驟時間軸。
 *
 * 事件是 append-only 的：同一個步驟會有 running → succeeded 兩筆以上。
 * 沒有 slideNumber 的事件決定「步驟本身」的狀態，帶 slideNumber 的事件
 * 則是該步驟底下的逐頁明細。
 */

export const DECK_STEPS = [
  { id: "source", label: "解析素材" },
  { id: "outline", label: "規劃簡報大綱" },
  { id: "images", label: "產生配圖" },
  { id: "slides", label: "逐頁設計版面" },
  { id: "quality", label: "版面品質檢查" },
  { id: "export", label: "匯出 PowerPoint" },
];

const STEP_ORDER = DECK_STEPS.map((step) => step.id);

export const buildTimeline = (events = []) => {
  const ordered = [...events].sort((a, b) => (a.id || 0) - (b.id || 0));
  const byStep = new Map(
    DECK_STEPS.map((step) => [
      step.id,
      { ...step, status: "pending", detail: "", items: [] },
    ])
  );

  for (const event of ordered) {
    const step = byStep.get(event.step);
    if (!step) continue;

    if (event.slideNumber == null) {
      step.status = event.status || "running";
      if (event.detail) step.detail = event.detail;
      continue;
    }

    const existing = step.items.find((item) => item.slideNumber === event.slideNumber);
    const item = existing || { slideNumber: event.slideNumber };
    item.status = event.status || "running";
    item.detail = event.detail || item.detail || "";
    if (!existing) step.items.push(item);
  }

  const steps = STEP_ORDER.map((id) => byStep.get(id));
  steps.forEach((step) => step.items.sort((a, b) => a.slideNumber - b.slideNumber));
  return steps;
};

export const activeStepIndex = (steps) =>
  steps.findIndex((step) => step.status === "running" || step.status === "failed");
