// 應用程式設定 (Configuration)

// 1. Local development auth bypass
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === "true";

// 2. Google OAuth public client configuration
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// 3. API configuration (SWA proxy / App Service gateway)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

export const DEFAULT_IMAGE_LANGUAGE = "zh-TW";

// Display labels only; supported qualities and defaults come from the model catalog.
export const IMAGE_QUALITY_LABELS = {
  low: "低",
  medium: "中",
  high: "高",
  xhigh: "超高",
  max: "最高",
  auto: "自動",
};
