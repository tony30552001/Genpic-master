const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { IMAGE_QUALITIES } = require("../_shared/gptImage");
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
  const { uploadId, mode, prompt, aspectRatio, imageSize, quality, imageLanguage } = body;

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
  if (quality && !IMAGE_QUALITIES.includes(quality)) {
    context.res = error("不支援的圖片品質", "bad_request", 400);
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

    const modelPolicy = await ensureModelPolicy(identity.tenantId);
    const selectedModel = modelPolicy.defaultModel;
    const textPrompt = buildTransformPrompt({ mode, prompt, imageLanguage });

    const job = await createImageJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      model: selectedModel,
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
        model: selectedModel,
      },
      202
    );
  } catch (err) {
    context.log.error("Image transform failed:", err);
    context.res = error("圖片轉換失敗，請稍後重試", "transform_failed", 502);
  }
};
