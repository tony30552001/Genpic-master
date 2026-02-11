import { acquireAccessToken } from "./authService";
import { AUTH_BYPASS } from "../config";

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
