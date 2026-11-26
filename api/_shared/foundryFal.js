const { VideoModelError } = require("./videoModelFamilies");

class FoundryFalError extends Error {
  constructor(message, code, status = 502, { retryable = false, retryAfterMs = 0 } = {}) {
    super(message);
    this.name = "FoundryFalError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

const readError = async (response) => {
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // Provider bodies are intentionally not surfaced to users or logs.
  }
  // Foundry reports `error_type`; fal model errors use `detail: [{ type }]`.
  const modelErrors = Array.isArray(payload?.detail) ? payload.detail : [];
  const errorType =
    payload?.error_type || payload?.error?.code || modelErrors.find((item) => item?.type)?.type || null;
  const retryAfterMs = Number(response.headers.get("retry-after-ms")) || 0;
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
  const classify = () => {
    if (errorType === "content_policy_violation" || errorType === "safety_check_error") {
      return new FoundryFalError("內容未通過安全檢查，請調整描述或參考畫面後重試", "content_policy_blocked", 422);
    }
    if (errorType === "schema_validation_error" || (response.status === 422 && modelErrors.length)) {
      return new FoundryFalError("影片參數未通過模型驗證，請調整後重試", "video_validation_failed", 400);
    }
    if (errorType === "wrong_deployment_name") {
      return new FoundryFalError("影片模型部署不存在，請聯絡管理員", "video_model_not_configured", 503);
    }
    if (response.status === 429 || errorType === "rate_limit_exceeded") {
      return new FoundryFalError("影片服務目前忙碌，系統會自動重試", "provider_rate_limited", 429, {
        retryable: true,
        retryAfterMs,
      });
    }
    return new FoundryFalError("影片服務暫時無法使用，請稍後重試", "video_provider_failed", response.status, {
      retryable,
    });
  };
  const error = classify();
  error.providerStatus = response.status;
  error.providerErrorType = errorType;
  return error;
};

const request = async (config, url, options = {}) => {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "api-key": config.apiKey,
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch (cause) {
    throw new FoundryFalError(
      "影片服務連線暫時失敗，系統會自動重試",
      "video_provider_unavailable",
      503,
      { retryable: true }
    );
  }
  if (!response.ok) throw await readError(response);
  return response;
};

const providerUrl = (config, path) =>
  `${config.endpoint}/${path.replace(/^\/+/, "")}`;

const submitVideo = async ({ config, path, body }) => {
  const response = await request(config, providerUrl(config, path), {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (typeof data?.request_id !== "string" || !data.request_id.trim()) {
    throw new FoundryFalError("影片服務未回傳工作識別碼", "video_provider_invalid_response");
  }
  return data.request_id.trim();
};

const getVideoRequestStatus = async ({ config, familyRoute, requestId }) => {
  const response = await request(
    config,
    providerUrl(config, `${familyRoute}/requests/${encodeURIComponent(requestId)}/status`)
  );
  const data = await response.json();
  const status = String(data?.status || "").toUpperCase();
  if (!["IN_QUEUE", "IN_PROGRESS", "COMPLETED"].includes(status)) {
    throw new FoundryFalError("影片服務回傳不支援的工作狀態", "video_provider_invalid_response");
  }
  return status;
};

const getVideoResult = async ({ config, familyRoute, requestId }) => {
  const response = await request(
    config,
    providerUrl(config, `${familyRoute}/requests/${encodeURIComponent(requestId)}`)
  );
  const data = await response.json();
  const url = data?.video?.url;
  if (typeof url !== "string" || !url.trim()) {
    throw new FoundryFalError("影片服務未回傳成品網址", "video_provider_invalid_response");
  }
  return {
    url: url.trim(),
    contentType: String(data?.video?.content_type || "video/mp4").split(";", 1)[0],
    fileSize: Number(data?.video?.file_size) || null,
    durationSeconds: Number(data?.timings?.inference) || null,
  };
};

const assertSafeAssetUrl = (value, endpoint) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new FoundryFalError("影片服務回傳的成品網址無效", "video_provider_invalid_response");
  }
  const endpointUrl = new URL(endpoint);
  if (
    url.protocol !== endpointUrl.protocol ||
    url.host !== endpointUrl.host ||
    !url.pathname.startsWith("/providers/falai/v1/assets/")
  ) {
    throw new FoundryFalError("影片成品網址未通過安全驗證", "video_provider_invalid_response");
  }
  return url;
};

const downloadVideoResult = async ({ config, result }) => {
  const url = assertSafeAssetUrl(result.url, config.endpoint);
  const response = await request(config, url.toString());
  if (!response.body) {
    throw new FoundryFalError("影片成品無法下載", "video_provider_invalid_response");
  }
  return {
    stream: response.body,
    contentType: response.headers.get("content-type")?.split(";", 1)[0] || result.contentType,
    size: Number(response.headers.get("content-length")) || result.fileSize || null,
  };
};

const isTransientVideoError = (error) =>
  error instanceof FoundryFalError && error.retryable;

module.exports = {
  FoundryFalError,
  downloadVideoResult,
  getVideoRequestStatus,
  getVideoResult,
  isTransientVideoError,
  submitVideo,
};
