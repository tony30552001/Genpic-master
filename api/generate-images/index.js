const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { generateGeminiImage } = require("../_shared/geminiImage");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { createImageJob } = require("../_shared/imageJobs");
const {
  IMAGE_QUALITIES,
  editGptImage,
  generateGptImage,
} = require("../_shared/gptImage");
const { buildImagePrompt } = require("../_shared/imagePrompt");
const {
  TemplateContextError,
  normalizeTemplateContext,
} = require("../_shared/templateContext");
const {
  downloadOwnedImage,
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
    templateContext,
  } = body;
  if (!userScript || !String(userScript).trim()) {
    context.res = error("缺少 userScript", "bad_request", 400);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(body, "imageUrl")) {
    context.res = error("不接受由呼叫端指定的圖片 URL", "bad_request", 400);
    return;
  }
  if (quality && !IMAGE_QUALITIES.includes(quality)) {
    context.res = error("不支援的圖片品質", "bad_request", 400);
    return;
  }

  let normalizedTemplateContext = null;
  try {
    normalizedTemplateContext = normalizeTemplateContext(templateContext);
  } catch (err) {
    if (err instanceof TemplateContextError) {
      context.res = error(err.message, err.code, err.status);
      return;
    }
    throw err;
  }

  try {
    let referenceImage = null;
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
      const source = await downloadOwnedImage(upload);
      referenceImage = {
        base64: source.buffer.toString("base64"),
        mimeType: source.contentType,
      };
    }

    const modelPolicy = await ensureModelPolicy(identity.tenantId);
    const selectedModel = modelPolicy.defaultModel;
    const prompt = buildImagePrompt({
      userScript,
      stylePrompt,
      styleTags,
      purpose,
      imageLanguage,
      templateContext: normalizedTemplateContext,
    });

    if (selectedModel === "gpt-image-2") {
      if (referenceImage) {
        const result = await editGptImage({
          imageBase64: referenceImage.base64,
          mimeType: referenceImage.mimeType,
          prompt,
          aspectRatio,
          quality,
        });
        context.res = ok({
          ...result,
          aspectRatio: aspectRatio || "1:1",
          prompt,
          model: selectedModel,
        });
        return;
      }

      if (process.env.FUNCTIONS_WORKER_RUNTIME) {
        const result = await generateGptImage({ prompt, aspectRatio, quality });
        context.res = ok({
          ...result,
          aspectRatio: aspectRatio || "1:1",
          prompt,
          model: selectedModel,
        });
        return;
      }

      const job = await createImageJob({
        tenantId: identity.tenantId,
        userId: identity.userId,
        prompt,
        aspectRatio,
        imageSize,
        quality,
        model: selectedModel,
      });
      context.res = ok(
        {
          jobId: job.id,
          status: job.status,
          aspectRatio: aspectRatio || "1:1",
          prompt,
          model: selectedModel,
        },
        202
      );
      return;
    }

    const image = await generateGeminiImage({
      prompt,
      aspectRatio,
      imageSize,
      referenceImage,
      logger: context.log,
    });

    context.res = ok({
      imageUrl: `data:${image.mimeType};base64,${image.base64}`,
      aspectRatio: aspectRatio || "16:9",
      prompt: image.prompt,
      model: selectedModel,
    });
  } catch (err) {
    context.log.error("Image generation failed:", err);

    // 檢查是否為伺服器尖峰過載錯誤
    const errStr = String(err.message || err);
    const isOverloaded = errStr.includes("503") || errStr.includes("429") || errStr.includes("UNAVAILABLE") || errStr.includes("high demand");

    if (isOverloaded) {
      context.res = error(
        "目前 AI 繪圖伺服器處於尖峰時段，過於繁忙，請稍後一分鐘再試。",
        "server_overloaded",
        503
      );
    } else {
      // 非過載錯誤：回傳通用訊息，避免洩漏內部錯誤細節
      context.log.error("Image generation failed (non-overload):", err.message);
      context.res = error("圖片生成失敗，請稍後重試", "generation_failed", 502);
    }
  }
};
