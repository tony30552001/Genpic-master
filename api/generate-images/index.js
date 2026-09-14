const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ImageModelError } = require("../_shared/imageModelConfig");
const { createImageJob } = require("../_shared/imageJobs");
const { buildImagePrompt } = require("../_shared/imagePrompt");
const {
  resolveOwnedImageUpload,
} = require("../_shared/imageUploads");

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
    userScript,
    stylePrompt,
    styleTags,
    purpose,
    imageLanguage,
    aspectRatio,
    imageSize,
    referenceUploadId,
    quality,
  } = body;
  if (!userScript || !String(userScript).trim()) {
    context.res = error("缺少 userScript", "bad_request", 400);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
    context.res = error("不接受由呼叫端指定的圖片 URL", "bad_request", 400);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, "model")) {
    context.res = error("圖片模型由租戶政策決定", "bad_request", 400);
    return;
  }

  try {
    let sourceUploadId = null;
    if (referenceUploadId !== undefined && referenceUploadId !== null) {
      const upload = await resolveOwnedImageUpload({
        uploadId: referenceUploadId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      });
      if (!upload) {
        context.res = error("找不到可用的上傳圖片", "upload_not_found", 404);
        return;
      }
      sourceUploadId = upload.id;
    }

    const prompt = buildImagePrompt({
      userScript,
      stylePrompt,
      styleTags,
      purpose,
      imageLanguage,
    });

    const job = await createImageJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      prompt,
      aspectRatio,
      imageSize,
      quality,
      operation: sourceUploadId ? "edit" : "generate",
      sourceUploadId,
    });
    context.res = ok(
      {
        jobId: job.id,
        status: job.status,
        aspectRatio: aspectRatio || "1:1",
        prompt,
        model: job.model,
        operation: job.operation,
      },
      202
    );
  } catch (err) {
    context.log.error("Image generation admission failed:", {
      status: Number.isInteger(err?.status) ? err.status : undefined,
    });
    context.res = err instanceof ImageModelError
      ? error(err.message, err.code, err.status)
      : error("圖片生成失敗，請稍後重試", "generation_failed", 502);
  }
};
