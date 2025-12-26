// 應用程式設定 (Configuration)

// 1. Firebase 設定
// 請將下方的設定替換為您的 Firebase 專案設定
export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 2. Gemini/Imagen API 金鑰與模型設定
// 從環境變數 (.env) 讀取
export const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
export const GEMINI_MODEL_ANALYSIS = import.meta.env.VITE_GEMINI_MODEL_ANALYSIS || "gemini-1.5-flash";
export const GEMINI_MODEL_GENERATION = import.meta.env.VITE_GEMINI_MODEL_GENERATION || "imagen-3.0-generate-001";

// 3. 應用程式 ID (用於 Firestore 路徑，可自訂)
export const APP_ID = "default-app-id";
