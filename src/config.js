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
  },
  {
    id: "gpt-image-2",
    label: "GPT Image 2",
    description: "OpenAI 最新圖片生成模型，支援高品質影像與精確文字渲染。",
    sizes: ["1024x1024", "1024x1536", "1536x1024"],
    supportsSizeMapping: true,
  },
];

export const DEFAULT_IMAGE_MODEL = "gemini-imagen";
export const DEFAULT_IMAGE_LANGUAGE = "zh-TW";
