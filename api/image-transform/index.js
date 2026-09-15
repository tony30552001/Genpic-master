const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ImageModelError } = require("../_shared/imageModelConfig");
const { createImageJob } = require("../_shared/imageJobs");
const { buildTransformPrompt } = require("../_shared/imagePrompt");
const { resolveOwnedImageUpload } = require("../_shared/imageUploads");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId || !identity.tenantId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  const body = req.body || {};
  const {
    uploadId,
    mode,
    prompt,
    stylePrompt,
    styleTags,
    aspectRatio,
    imageSize,
    quality,
    imageLanguage,
  } = body;

  if (
    Object.prototype.hasOwnProperty.call(body, "imageBase64") ||
    Object.prototype.hasOwnProperty.call(body, "imageUrl")
  ) {
    context.res = error("不接受由呼叫端提供的圖片資料", "bad_request", 400);
    return;
  }
  if (typeof uploadId !== "string" || !uploadId.trim()) {
    context.res = error("找不到可用的上傳圖片", "upload_not_found", 404);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, "model")) {
    context.res = error("圖片模型由租戶政策決定", "bad_request", 400);
    return;
  }

  try {
    const upload = await resolveOwnedImageUpload({
      uploadId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!upload) {
      context.res = error("找不到可用的上傳圖片", "upload_not_found", 404);
      return;
    }

    const textPrompt = buildTransformPrompt({
      mode,
      prompt,
      stylePrompt,
      styleTags,
      imageLanguage,
      aspectRatio,
    });

    const job = await createImageJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      prompt: textPrompt,
      aspectRatio,
      imageSize,
      quality,
      operation: "edit",
      sourceUploadId: upload.id,
    });
    context.res = ok(
      {
        jobId: job.id,
        status: job.status,
        mode,
        prompt: textPrompt,
        aspectRatio: aspectRatio || "1:1",
        model: job.model,
        operation: job.operation,
      },
      202
    );
  } catch (err) {
    context.log.error("Image transform admission failed:", {
      status: Number.isInteger(err?.status) ? err.status : undefined,
    });
    context.res = err instanceof ImageModelError
      ? error(err.message, err.code, err.status)
      : error("圖片轉換失敗，請稍後重試", "transform_failed", 502);
  }
};
