const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { IMAGE_QUALITIES, editGptImage } = require("../_shared/gptImage");
const { buildTransformPrompt } = require("../_shared/imagePrompt");
const {
  downloadOwnedImage,
  resolveOwnedImageUpload,
} = require("../_shared/imageUploads");

const isOverloadedError = (candidate) => {
  const status = Number(candidate?.status);
  const message = String(candidate?.message || candidate);
  return (
    status === 429 ||
    status >= 500 ||
    message.includes("503") ||
    message.includes("429") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand")
  );
};

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
    const source = await downloadOwnedImage(upload);
    const sourceBase64 = source.buffer.toString("base64");
    const sourceMimeType = source.contentType;

    const modelPolicy = await ensureModelPolicy(identity.tenantId);
    const selectedModel = modelPolicy.defaultModel;
    const textPrompt = buildTransformPrompt({ mode, prompt, imageLanguage });

    if (selectedModel === "gpt-image-2") {
      const result = await editGptImage({
        imageBase64: sourceBase64,
        mimeType: sourceMimeType,
        prompt: textPrompt,
        aspectRatio,
        quality,
      });
      context.res = ok({
        ...result,
        mode,
        prompt: textPrompt,
        aspectRatio: aspectRatio || "1:1",
        model: selectedModel,
      });
      return;
    }

    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3.1-flash-image-preview";
    const model = getModel(modelName, process.env.GOOGLE_API_KEY);

    const fullPrompt = aspectRatio
      ? `${textPrompt}\nAspect ratio: ${aspectRatio}.`
      : textPrompt;

    const parts = [
      { text: fullPrompt },
      { inlineData: { mimeType: sourceMimeType, data: sourceBase64 } },
    ];

    const config = {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
      },
    };

    let result;
    const maxRetries = 2;
    let delayMs = 2000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        result = await model.generateContent(parts, config);
        break;
      } catch (apiErr) {
        if (attempt < maxRetries && isOverloadedError(apiErr)) {
          context.log.warn(`AI API overload (attempt ${attempt + 1}/${maxRetries}), retrying in ${delayMs}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          delayMs *= 2;
        } else {
          throw apiErr;
        }
      }
    }

    const responseParts =
      result?.candidates?.[0]?.content?.parts ||
      result?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];

    let base64Image = null;
    let outputMimeType = "image/png";
    for (const part of responseParts) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        base64Image = inlineData.data;
        outputMimeType = inlineData.mimeType || inlineData.mime_type || outputMimeType;
        break;
      }
    }

    if (!base64Image) {
      context.res = error("模型未回傳圖片資料", "no_image", 502);
      return;
    }

    context.res = ok({
      imageUrl: `data:${outputMimeType};base64,${base64Image}`,
      mode,
      prompt: fullPrompt,
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel,
    });
  } catch (err) {
    context.log.error("Image transform failed:", err);

    if (isOverloadedError(err)) {
      context.res = error(
        "目前 AI 繪圖伺服器處於尖峰時段，過於繁忙，請稍後一分鐘再試。",
        "server_overloaded",
        503
      );
    } else {
      context.res = error("圖片轉換失敗，請稍後重試", "transform_failed", 502);
    }
  }
};
