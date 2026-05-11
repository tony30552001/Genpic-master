const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");
const { isUrlAllowed } = require("../_shared/urlValidator");

/**
 * 依轉換模式建構 Gemini 文字 Prompt
 */
const buildTransformPrompt = (mode, userPrompt) => {
  const base = userPrompt ? userPrompt.trim() : "";
  switch (mode) {
    case "style_transfer":
      return `Transform the visual style of this image. Apply the following style: ${base || "a fresh artistic style"}. Keep the same subjects, composition, and content, but change the color palette, artistic treatment, and visual style completely.`;
    case "element_extract":
      return `Extract the main subjects and key elements from this image. Place them in a new scene or context as described: ${base || "a completely new environment"}. Keep the extracted subjects recognizable but adapt them naturally to the new context.`;
    case "bg_replace":
      return `Keep the main foreground subjects and characters in this image exactly as they appear. Replace only the background with: ${base || "a new background"}. The foreground subjects must remain unchanged.`;
    case "reference_gen":
    default:
      return `Using this image as a visual reference and inspiration, generate a completely new image based on the following description: ${base || "a creative new image inspired by this reference"}. Incorporate similar color palette, mood, and composition style.`;
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

  const { imageBase64, mimeType, imageUrl, mode, prompt, aspectRatio, imageSize } = req.body || {};

  if (!imageBase64 && !imageUrl) {
    context.res = error("缺少來源圖片 (imageBase64 or imageUrl)", "bad_request", 400);
    return;
  }

  try {
    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3-pro-image-preview";
    const model = getModel(modelName);

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

    const textPrompt = buildTransformPrompt(mode, prompt);
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
