// 應用程式設定 (Configuration)

// 1. Microsoft Entra ID 設定 (MSAL)
export const MSAL_CLIENT_ID = import.meta.env.VITE_MSAL_CLIENT_ID || "529a30b4-cdd0-4dbb-b3e6-257e717dfdbf";
export const MSAL_TENANT_ID = import.meta.env.VITE_MSAL_TENANT_ID || "6f4e2c19-7620-4dea-8852-11ec264fbef1";
export const MSAL_REDIRECT_URI = (import.meta.env.VITE_MSAL_REDIRECT_URI || window.location.origin).replace(/\/$/, "");
export const MSAL_SCOPES = (import.meta.env.VITE_MSAL_SCOPES || "User.Read")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);

export const AUTH_BYPASS = import.meta.env.VITE_AUTH_BYPASS === "true";

// 2. Google OAuth 設定
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// 3. API 設定 (Azure Functions Gateway)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// 4. GPT-Image-2 設定 (Azure AI Foundry)
export const GPT_IMAGE_ENDPOINT = import.meta.env.VITE_GPT_IMAGE_ENDPOINT || "";
export const GPT_IMAGE_API_KEY = import.meta.env.VITE_GPT_IMAGE_API_KEY || "";

// GPT-Image-2 圖片編輯端點（若未設定，自動從生成端點推導）
const _gptEditEnv = import.meta.env.VITE_GPT_IMAGE_EDIT_ENDPOINT || "";
export const GPT_IMAGE_EDIT_ENDPOINT = _gptEditEnv ||
  (GPT_IMAGE_ENDPOINT ? GPT_IMAGE_ENDPOINT.replace(/\/images\/generations([^/]*)$/, "/images/edits$1") : "");

// 5. 圖片生成模型選項
export const IMAGE_MODEL_OPTIONS = [
    {
        id: "gemini-imagen",
        label: "Nano Banana 2",
        description: "Google Gemini & Imagen 圖片生成模型，透過後端 API Gateway 呼叫。",
        sizes: ["1K", "2K", "4K"],
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
