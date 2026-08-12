import { AUTH_BYPASS } from "../config";

export class AuthExpiredError extends Error {
  constructor(message = "登入工作階段已失效，請重新登入") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

let onAuthExpiredCallback = null;
let csrfToken = null;

export const setAuthExpiredHandler = (callback) => {
  onAuthExpiredCallback = callback;
};

export const setCsrfToken = (token) => {
  csrfToken = typeof token === "string" && token ? token : null;
};

export const clearCsrfToken = () => {
  csrfToken = null;
};

const isMutatingMethod = (method) =>
  !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());

const buildHeaders = (options, method) => {
  const headers = {
    ...(options.headers || {}),
  };

  if (options.body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
    headers["Content-Type"] = "application/json";
  }

  if (
    !AUTH_BYPASS &&
    options.auth !== false &&
    options.csrf !== false &&
    isMutatingMethod(method)
  ) {
    if (!csrfToken) {
      throw new AuthExpiredError();
    }
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
};

const stripClientOptions = (options) => {
  const {
    auth: _auth,
    csrf: _csrf,
    _retried: _retried,
    responseType: _responseType,
    ...fetchOptions
  } = options;
  return fetchOptions;
};

const parseResponse = async (response, responseType = "json") => {
  if (!response.ok) {
    const text = typeof response.text === "function"
      ? await response.text()
      : typeof response.json === "function"
        ? JSON.stringify(await response.json())
        : "";
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

  if (responseType === "blob") {
    if (typeof response.blob === "function") return response.blob();
    if (typeof response.arrayBuffer === "function") {
      return new Blob([await response.arrayBuffer()]);
    }
  }

  if (typeof response.text !== "function") {
    return typeof response.json === "function" ? response.json() : null;
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export async function apiGet(url, options = {}) {
  return requestWithRetry(url, { method: "GET" }, options);
}

export async function apiGetBlob(url, options = {}) {
  return requestWithRetry(url, { method: "GET" }, { ...options, responseType: "blob" });
}

export async function apiPost(url, body, options = {}) {
  return requestWithRetry(
    url,
    { method: "POST", body: JSON.stringify(body ?? {}) },
    options
  );
}

export async function apiPostBlob(url, body, options = {}) {
  return requestWithRetry(
    url,
    { method: "POST", body: JSON.stringify(body ?? {}) },
    { ...options, responseType: "blob" }
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

const notifyAuthExpired = () => {
  onAuthExpiredCallback?.();
};

const requestWithRetry = async (url, baseOptions, options) => {
  let response;

  try {
    response = await fetch(url, {
      ...baseOptions,
      ...stripClientOptions(options),
      credentials: options.credentials || "include",
      headers: buildHeaders(
        { ...options, body: baseOptions.body },
        baseOptions.method
      ),
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw error;
    }
    if (error instanceof AuthExpiredError) {
      notifyAuthExpired();
      throw error;
    }
    throw new Error(`網路請求失敗: ${error.message}`);
  }

  if (response.status === 401 && options.auth !== false) {
    notifyAuthExpired();
    throw new AuthExpiredError();
  }

  return parseResponse(response, options.responseType);
};
