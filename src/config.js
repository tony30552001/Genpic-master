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

// 2. API 設定 (Azure Functions Gateway)
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
