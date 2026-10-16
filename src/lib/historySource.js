/** History source labels, mirroring api/_shared/historySource.js. */
export const HISTORY_SOURCE_LABELS = [
  { id: "general", label: "一般創作" },
  { id: "document", label: "文件分鏡" },
  { id: "chat", label: "對話創作" },
  { id: "refine", label: "修改這張" },
  { id: "bg_replace", label: "換背景" },
  { id: "element_extract", label: "取出元素" },
  { id: "style_transfer", label: "套用風格" },
  { id: "image-transform", label: "圖片轉換" },
  { id: "unknown", label: "未記錄" },
];

export const getHistorySourceLabel = (source) =>
  HISTORY_SOURCE_LABELS.find((item) => item.id === (source || "unknown"))?.label || "—";
