// 應用程式設定 (Configuration)

// 1. Local development auth bypass
export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === "true";

// 2. Google OAuth public client configuration
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// 3. API configuration (SWA proxy / App Service gateway)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// 4. Image generation model options
export const IMAGE_MODEL_OPTIONS = [
  {
    id: "gemini-imagen",
    label: "Nano Banana 2",
    description: "Google Gemini & Imagen 圖片生成模型，透過後端 API Gateway 呼叫。",
    sizes: ["512", "1K", "2K", "4K"],
    supportsSizeMapping: false,
    supportsQuality: false,
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    description: "OpenAI 最新圖片生成模型，支援高品質影像與精確文字渲染。",
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    supportsSizeMapping: true,
    supportsQuality: true,
  },
];

export const DEFAULT_IMAGE_MODEL = "gemini-imagen";
export const DEFAULT_IMAGE_LANGUAGE = "zh-TW";

// 5. GPT Image 2 rendering quality（僅 gpt-image-2 支援，對應 Azure 的 low/medium/high）
export const IMAGE_QUALITY_OPTIONS = [
  { id: "low", label: "低", description: "最快、成本最低，細節較粗糙。" },
  { id: "medium", label: "中", description: "速度與細節的平衡選擇。" },
  { id: "high", label: "高", description: "最銳利、文字最清晰，但較慢且成本最高。" },
];

export const DEFAULT_IMAGE_QUALITY = "medium";
