const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");
const { isUrlAllowed } = require("../_shared/urlValidator");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { IMAGE_QUALITIES, editGptImage } = require("../_shared/gptImage");

/**
 * 依轉換模式建構圖像編輯指令。
 * 圖像模型不是對話模型：直接下達畫面指令，不使用角色扮演前綴。
 */
const buildTransformPrompt = (mode, userPrompt) => {
  const base = userPrompt ? userPrompt.trim() : "";
  switch (mode) {
    case "style_transfer":
      return `Redraw this image in the following artistic style: ${base || "a fresh artistic style"}. Keep every subject, object, and their spatial arrangement exactly as they appear in the source image. Change only the rendering style, brushwork, texture, and color treatment.`;

    case "element_extract":
      return `Take the main foreground subjects out of this image and keep their appearance, details, and proportions exactly as they are. Place them into this new scene: ${base || "a new environment"}. Match the lighting direction, cast realistic shadows, and blend the subjects naturally into their new surroundings.`;

    case "bg_replace":
      return `Replace only the background of this image with: ${base || "a new background"}. Keep the foreground subjects unchanged — the same appearance, clothing, expressions, pose, and position. Relight them so they match the new background and the result looks photorealistic.`;

    case "reference_gen":
    default:
      return `Use this image only as a visual reference for its color palette, lighting, mood, and compositional structure. Create an entirely new image showing: ${base || "an original scene inspired by this reference"}. Keep the same aesthetic atmosphere and production quality, but none of the original content.`;
  }
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
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  const modelPolicy = await ensureModelPolicy(identity.tenantId);
  const selectedModel = modelPolicy.defaultModel;
  const { imageBase64, mimeType, imageUrl, mode, prompt, aspectRatio, imageSize, quality } =
    req.body || {};

  if (!imageBase64 && !imageUrl) {
    context.res = error("缺少來源圖片 (imageBase64 or imageUrl)", "bad_request", 400);
    return;
  }
  if (quality && !IMAGE_QUALITIES.includes(quality)) {
    context.res = error("不支援的圖片品質", "bad_request", 400);
    return;
  }

  try {
    const textPrompt = buildTransformPrompt(mode, prompt);

    if (selectedModel === "gpt-image-2") {
      let sourceBase64 = imageBase64 || null;
      let sourceMimeType = mimeType || "image/jpeg";

      if (!sourceBase64 && imageUrl) {
        if (!isUrlAllowed(imageUrl)) {
          context.res = error("提供的圖片 URL 不在允許範圍內", "bad_request", 400);
          return;
        }
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error("Failed to fetch source image");
        sourceBase64 = Buffer.from(await imageResponse.arrayBuffer()).toString("base64");
        sourceMimeType = imageResponse.headers.get("content-type") || sourceMimeType;
      }

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
        aspectRatio: aspectRatio || "1:1",
        model: selectedModel,
      });
      return;
    }

    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3.1-flash-image-preview";
    const model = getModel(modelName, process.env.GOOGLE_API_KEY);

    let base64Data = imageBase64 || null;
    let imageMimeType = mimeType || "image/jpeg";

    // 若前端傳 imageUrl，從 URL 取得圖片
    if (!base64Data && imageUrl) {
      if (!isUrlAllowed(imageUrl)) {
        context.res = error("提供的圖片 URL 不在允許範圍內", "bad_request", 400);
        return;
      }
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error("Failed to fetch source image");
      const arrayBuffer = await imageResponse.arrayBuffer();
      base64Data = Buffer.from(arrayBuffer).toString("base64");
      imageMimeType = imageResponse.headers.get("content-type") || imageMimeType;
    }

    const fullPrompt = aspectRatio
      ? `${textPrompt}\nAspect ratio: ${aspectRatio}.`
      : textPrompt;

    const parts = [
      { text: fullPrompt },
      { inlineData: { mimeType: imageMimeType, data: base64Data } },
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
        const errStr = String(apiErr.message || apiErr);
        const isOverloaded =
          errStr.includes("503") ||
          errStr.includes("429") ||
          errStr.includes("UNAVAILABLE") ||
          errStr.includes("high demand");

        if (attempt < maxRetries && isOverloaded) {
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
      aspectRatio: aspectRatio || "16:9",
      model: selectedModel,
    });
  } catch (err) {
    context.log.error("Image transform failed:", err);
    const errStr = String(err.message || err);
    const isOverloaded =
      errStr.includes("503") ||
      errStr.includes("429") ||
      errStr.includes("UNAVAILABLE") ||
      errStr.includes("high demand");

    if (isOverloaded) {
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
