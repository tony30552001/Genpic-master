import { PublicClientApplication, LogLevel } from "@azure/msal-browser";

import {
  MSAL_CLIENT_ID,
  MSAL_TENANT_ID,
  MSAL_REDIRECT_URI,
  MSAL_SCOPES,
} from "../config";

const authority = MSAL_TENANT_ID
  ? `https://login.microsoftonline.com/${MSAL_TENANT_ID}`
  : "https://login.microsoftonline.com/common";

export const msalConfig = {
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority,
    redirectUri: MSAL_REDIRECT_URI,
    navigateToLoginRequestUrl: false,
  },
  cache: {
    cacheLocation: "localStorage",
    // storeAuthStateInCookie: true 可解決部分瀏覽器在 Safari / 隱私模式下
    // 因 SameSite Cookie 政策導致 iframe 靜默取 Token 失敗 (block_iframe_reload) 的問題
    storeAuthStateInCookie: true,
  },
  system: {
    // 避免在 iframe 內部發起額外的 redirect，防止無限重新載入
    allowRedirectInIframe: false,
    loggerOptions: {
      // 只顯示 Warning 及 Error，減少 console 噪音
      logLevel: LogLevel.Warning,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            return;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            return;
          default:
            return;
        }
      },
    },
  },
};

export const loginRequest = {
  scopes: MSAL_SCOPES,
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Initialize is handled in main.jsx to prevent race conditions and handle popup flow gracefully

