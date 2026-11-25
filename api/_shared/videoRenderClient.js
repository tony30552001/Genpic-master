const { signGeneratedBlobUrl } = require("./blobStorage");

const TIMEOUT_MS = Number(process.env.VIDEO_RENDER_TIMEOUT_MS || 180000);
// Container Apps closes a request after 240 seconds.
const CONCAT_TIMEOUT_MS = Number(process.env.VIDEO_RENDER_CONCAT_TIMEOUT_MS || 235000);
const SAS_TTL_MS = 15 * 60 * 1000;

const getServiceUrl = () =>
  String(process.env.VIDEO_RENDER_SERVICE_URL || "").replace(/\/+$/, "");

const getServiceKey = () => String(process.env.VIDEO_RENDER_SERVICE_KEY || "");

const isConfigured = () => Boolean(getServiceUrl() && getServiceKey());

/** `retryable` marks failures worth retrying: network, timeout and 5xx. */
class VideoRenderError extends Error {
  constructor(message, code, { retryable = false } = {}) {
    super(message);
    this.name = "VideoRenderError";
    this.code = code;
    this.retryable = retryable;
  }
}

const describeFailure = (payload, status) => {
  const detail = payload?.detail;
  if (typeof detail === "string") return `影片組合服務失敗：${detail} (${status})`;
  if (detail?.message) return `影片組合服務失敗：${detail.message} (${status})`;
  return `影片組合服務請求失敗 (${status})`;
};

const request = async (path, body, { timeoutMs = TIMEOUT_MS } = {}) => {
  if (!isConfigured()) {
    throw new VideoRenderError(
      "VIDEO_RENDER_SERVICE_URL 或 VIDEO_RENDER_SERVICE_KEY 尚未設定，無法使用影片組合服務",
      "video_render_unconfigured"
    );
  }

  let response;
  try {
    response = await fetch(`${getServiceUrl()}${path}`, {
      method: "POST",
      headers: {
        "X-Pixora-Service-Key": getServiceKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new VideoRenderError("影片組合服務逾時未回應", "video_render_timeout", { retryable: true });
    }
    throw new VideoRenderError(`無法連線影片組合服務：${error.message}`, "video_render_unreachable", {
      retryable: true,
    });
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new VideoRenderError(describeFailure(payload, response.status), "video_render_failed", {
      retryable: response.status >= 500,
    });
  }
  return payload;
};

const readUrl = (blobName) =>
  signGeneratedBlobUrl({ blobName, permissions: "r", expiresInMs: SAS_TTL_MS });

/**
 * Writes the final frame of a generated video to `frameBlobName` (PNG) in the
 * generated container. Both blobs travel as short-lived SAS URLs, so the video
 * never passes through the API.
 */
const extractLastFrame = async ({ videoBlobName, frameBlobName }) => {
  const result = await request("/last-frame", {
    videoUrl: readUrl(videoBlobName),
    frameUrl: signGeneratedBlobUrl({ blobName: frameBlobName, permissions: "cw", expiresInMs: SAS_TTL_MS }),
  });
  return {
    blobName: frameBlobName,
    contentType: result.contentType,
    width: result.width,
    height: result.height,
    sizeBytes: result.sizeBytes,
  };
};

/**
 * Joins segment videos in order into `outputBlobName` (MP4). Matching
 * segments are stream-copied; otherwise the service re-encodes them to the
 * first segment's size and frame rate.
 */
const concatSegments = async ({ segmentBlobNames, outputBlobName }) => {
  const result = await request(
    "/render",
    {
      segmentUrls: segmentBlobNames.map(readUrl),
      outputUrl: signGeneratedBlobUrl({ blobName: outputBlobName, permissions: "cw", expiresInMs: SAS_TTL_MS }),
    },
    { timeoutMs: CONCAT_TIMEOUT_MS }
  );
  return {
    blobName: outputBlobName,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    durationSeconds: result.durationSeconds,
    width: result.width,
    height: result.height,
    copied: result.copied,
  };
};

module.exports = { VideoRenderError, concatSegments, extractLastFrame, isConfigured };
