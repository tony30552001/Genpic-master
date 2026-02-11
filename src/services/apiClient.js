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
    const token = await acquireAccessToken();
    headers.Authorization = `Bearer ${token}`;
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
  const response = await fetch(url, {
    ...baseOptions,
    headers: await buildHeaders(options),
    ...options,
  });

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

    // Microsoft 使用者可以嘗試重新取得 Token
    const retryOptions = { ...options, _retried: true };
    const retryResponse = await fetch(url, {
      ...baseOptions,
      headers: await buildHeaders(retryOptions),
      ...retryOptions,
    });
    return parseResponse(retryResponse);
  }

  return parseResponse(response);
};
