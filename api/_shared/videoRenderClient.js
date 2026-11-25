const { signGeneratedBlobUrl } = require("./blobStorage");

const TIMEOUT_MS = Number(process.env.VIDEO_RENDER_TIMEOUT_MS || 180000);
const SAS_TTL_MS = 15 * 60 * 1000;

const getServiceUrl = () =>
  String(process.env.VIDEO_RENDER_SERVICE_URL || "").replace(/\/+$/, "");

const getServiceKey = () => String(process.env.VIDEO_RENDER_SERVICE_KEY || "");

const isConfigured = () => Boolean(getServiceUrl() && getServiceKey());

const describeFailure = (payload, status) => {
  const detail = payload?.detail;
  if (typeof detail === "string") return `影片組合服務失敗：${detail} (${status})`;
  if (detail?.message) return `影片組合服務失敗：${detail.message} (${status})`;
  return `影片組合服務請求失敗 (${status})`;
};

const request = async (path, body) => {
  if (!isConfigured()) {
    throw new Error("VIDEO_RENDER_SERVICE_URL 或 VIDEO_RENDER_SERVICE_KEY 尚未設定，無法使用影片組合服務");
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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error.name === "TimeoutError") throw new Error("影片組合服務逾時未回應");
    throw new Error(`無法連線影片組合服務：${error.message}`);
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) throw new Error(describeFailure(payload, response.status));
  return payload;
};

/**
 * Writes the final frame of a generated video to `frameBlobName` (PNG) in the
 * generated container. Both blobs travel as short-lived SAS URLs, so the video
 * never passes through the API.
 */
const extractLastFrame = async ({ videoBlobName, frameBlobName }) => {
  const result = await request("/last-frame", {
    videoUrl: signGeneratedBlobUrl({ blobName: videoBlobName, permissions: "r", expiresInMs: SAS_TTL_MS }),
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

module.exports = { extractLastFrame, isConfigured };
