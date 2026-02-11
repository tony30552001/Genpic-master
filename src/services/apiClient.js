import { acquireAccessToken } from "./authService";
import { AUTH_BYPASS } from "../config";

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
      headers.Authorization = `Bearer ${token}`;
    } catch (error) {
      // 無法取得 token，觸發認證過期處理
      if (onAuthExpiredCallback) {
        onAuthExpiredCallback();
      }
      throw new Error("無法取得認證資訊，請重新登入");
    }
  }

  return headers;
};

const parseResponse = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
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
    // buildHeaders 可能因為認證問題拋出錯誤
    if (error.message.includes("無法取得認證資訊")) {
      throw error;
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
      throw new Error("登入已過期，請重新登入");
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
      if (onAuthExpiredCallback) {
        onAuthExpiredCallback();
      }
      throw new Error("認證已過期，請重新登入");
    }
  }

  return parseResponse(response);
};
