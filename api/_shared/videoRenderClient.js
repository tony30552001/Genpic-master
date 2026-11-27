const { signGeneratedBlobUrl } = require("./blobStorage");
const { issueReadGrant } = require("./uploadStorage");

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

const readGeneratedUrl = (blobName) =>
  signGeneratedBlobUrl({ blobName, permissions: "r", expiresInMs: SAS_TTL_MS });

const writeGeneratedUrl = (blobName) =>
  signGeneratedBlobUrl({ blobName, permissions: "cw", expiresInMs: SAS_TTL_MS });

const readClipUrl = (clip) => {
  if (clip.upload) {
    const grant = issueReadGrant(clip.upload);
    return `${grant.blobUrl}?${grant.sasToken}`;
  }
  return readGeneratedUrl(clip.blobName);
};

/**
 * Writes the final frame of a generated video to `frameBlobName` (PNG) in the
 * generated container. Both blobs travel as short-lived SAS URLs, so the video
 * never passes through the API.
 */
const extractLastFrame = async ({ videoBlobName, frameBlobName }) => {
  const result = await request("/last-frame", {
    videoUrl: readGeneratedUrl(videoBlobName),
    frameUrl: writeGeneratedUrl(frameBlobName),
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
 * Composes video clips, static image slides, transitions, narration tracks,
 * on-screen text and optional ASS subtitles into `outputBlobName` (MP4), plus
 * an optional UTF-8 `.srt` file at `subtitleBlobName`.
 */
const renderTimeline = async ({
  width = 1920,
  height = 1080,
  fps = 24,
  transition = "cut",
  transitionDuration = 0.5,
  burnSubtitles = false,
  clips,
  outputBlobName,
  subtitleBlobName = null,
}) => {
  const body = {
    width,
    height,
    fps,
    transition,
    transitionDuration,
    burnSubtitles: Boolean(burnSubtitles),
    clips: clips.map((clip) => ({
      kind: clip.kind,
      url: readClipUrl(clip),
      ...(clip.duration != null ? { duration: clip.duration } : {}),
      sourceAudio: clip.sourceAudio || "keep",
      narrations: (clip.narrations || []).map((narration) => ({
        url: readGeneratedUrl(narration.blobName),
        offset: narration.offset || 0,
        cues: narration.cues || [],
      })),
      overlays: clip.overlays || [],
    })),
    outputUrl: writeGeneratedUrl(outputBlobName),
    ...(subtitleBlobName ? { subtitleUrl: writeGeneratedUrl(subtitleBlobName) } : {}),
  };
  const result = await request("/render", body, { timeoutMs: CONCAT_TIMEOUT_MS });
  return {
    blobName: outputBlobName,
    subtitleBlobName: result.subtitleSizeBytes ? subtitleBlobName : null,
    subtitleSizeBytes: result.subtitleSizeBytes ?? null,
    contentType: result.contentType,
    sizeBytes: result.sizeBytes,
    durationSeconds: result.durationSeconds,
    width: result.width,
    height: result.height,
    copied: result.copied,
  };
};

module.exports = { VideoRenderError, extractLastFrame, isConfigured, renderTimeline };
