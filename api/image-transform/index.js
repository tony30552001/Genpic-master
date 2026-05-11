const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");
const { isUrlAllowed } = require("../_shared/urlValidator");

/**
 * 依轉換模式建構 Gemini 文字 Prompt
 * 針對 gemini-3.1-flash-image-preview 的 advanced reasoning 最佳化
 */
const buildTransformPrompt = (mode, userPrompt) => {
  const base = userPrompt ? userPrompt.trim() : "";
  switch (mode) {
    case "style_transfer":
      return `You are an expert image style transfer artist. Look at this image carefully. Recreate it with a completely different artistic style: ${base || "a fresh artistic style"}. CRITICAL: preserve the exact same subjects, objects, composition layout, and spatial relationships. Only change the visual style, color treatment, brushwork, and artistic rendering. The content must remain identical.`;

    case "element_extract":
      return `You are a skilled image compositor. Identify and extract the main foreground subjects from this image — preserve their exact appearance, details, and proportions. Then place them naturally into a completely new scene: ${base || "a new environment"}. Ensure consistent lighting direction, realistic shadows, and natural integration between the extracted subjects and the new environment.`;

    case "bg_replace":
      return `You are a professional photo editor. In this image, keep the foreground subjects (people, objects) EXACTLY as they appear — do NOT alter their appearance, clothing, expressions, or position in any way. Replace ONLY the background with: ${base || "a new background"}. Match the lighting on the foreground subjects to the new background to make the composition look natural and photorealistic.`;

    case "reference_gen":
    default:
      return `Use this image as a visual reference. Analyze its color palette, mood, lighting style, and compositional structure. Generate an entirely new, original image with this description: ${base || "a creative new image inspired by this reference"}. The new image should share the same aesthetic atmosphere and visual quality as the reference, but with completely different content.`;
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
    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3.1-flash-image-preview";
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
