import { acquireAccessToken } from "./authService";
import { AUTH_BYPASS } from "../config";

// 認證過期專用錯誤類別
export class AuthExpiredError extends Error {
  constructor(message = '登入已過期，請重新登入') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

// Google Token 過期時的通知回呼 (由 AuthContext 設定)
let onAuthExpiredCallback = null;

export const setAuthExpiredHandler = (callback) => {
  onAuthExpiredCallback = callback;
};

const buildHeaders = async (options) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (!AUTH_BYPASS && options.auth !== false) {
    try {
      const token = await acquireAccessToken();
      if (!token) {
        // Token 取得為空（例如 Google token 已過期被清除）
        if (onAuthExpiredCallback) {
          onAuthExpiredCallback();
        }
        throw new Error("登入已過期，請重新登入");
      }
      headers['X-Auth-Token'] = token;
    } catch (error) {
      // 無法取得 token，觸發認證過期處理
      if (onAuthExpiredCallback) {
        onAuthExpiredCallback();
      }
      throw new Error(error.message || "無法取得認證資訊，請重新登入");
    }
  }

  return headers;
};

const parseResponse = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed: ${response.status}`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || json?.message || text || message;
    } catch {
      message = text || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (err) {
    return text; // 如果不是 JSON 就直接回傳字串
  }
};

export async function apiGet(url, options = {}) {
  return requestWithRetry(url, { method: "GET" }, options);
}

export async function apiPost(url, body, options = {}) {
  return requestWithRetry(
    url,
    { method: "POST", body: JSON.stringify(body ?? {}) },
    options
  );
}

export async function apiPut(url, body, options = {}) {
  return requestWithRetry(
    url,
    { method: "PUT", body: JSON.stringify(body ?? {}) },
    options
  );
}

export async function apiDelete(url, options = {}) {
  return requestWithRetry(url, { method: "DELETE" }, options);
}

const requestWithRetry = async (url, baseOptions, options) => {
  let response;

  try {
    response = await fetch(url, {
      ...baseOptions,
      headers: await buildHeaders(options),
      ...options,
    });
  } catch (error) {
    // 當 authExpired 時，onAuthExpiredCallback() 已經在 buildHeaders 中被觸發
    if (error.message.includes("請重新登入") || error.message.includes("無法取得認證資訊")) {
      // 拋出 AuthExpiredError，讓呼叫端能正確 catch 並重置 UI 狀態
      throw new AuthExpiredError(error.message);
    }
    throw new Error(`網路請求失敗: ${error.message}`);
  }

  if (response.status === 401 && !options._retried) {
    // 檢查是否為 Google 使用者 (Google Token 無法刷新)
    const googleUser = localStorage.getItem('google_user');
    if (googleUser) {
      // Google Token 過期，觸發重新登入
      if (onAuthExpiredCallback) {
        onAuthExpiredCallback();
      }
      throw new AuthExpiredError('Google 登入已過期，請重新登入');
    }

    // Microsoft 使用者：嘗試重新取得 Token 並重試一次
    const retryOptions = { ...options, _retried: true };
    try {
      const retryResponse = await fetch(url, {
        ...baseOptions,
        headers: await buildHeaders(retryOptions),
        ...retryOptions,
      });
      return parseResponse(retryResponse);
    } catch (retryError) {
      // 重試失敗，觸發登出
      // buildHeaders 如果出現錯誤，在上一層自己就會處理了，但這裡是 fetch 拋出 
      if (onAuthExpiredCallback) {
        onAuthExpiredCallback();
      }
      throw new AuthExpiredError('認證失敗，請重新登入');
    }
  }

  return parseResponse(response);
};
