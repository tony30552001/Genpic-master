const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");

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

  const { prompt, aspectRatio, imageSize } = req.body || {};
  if (!prompt) {
    context.res = error("缺少 prompt", "bad_request", 400);
    return;
  }

  try {
    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3-pro-image-preview";
    const model = getModel(modelName);
    const finalPrompt = aspectRatio
      ? `${prompt}\nAspect ratio: ${aspectRatio}.`
      : prompt;

    const config = {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
      },
    };

    const result = await model.generateContent([finalPrompt], config);

    const parts =
      result?.candidates?.[0]?.content?.parts ||
      result?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];
    let base64Image = null;
    let mimeType = "image/png";
    for (const part of parts) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        base64Image = inlineData.data;
        mimeType = inlineData.mimeType || inlineData.mime_type || mimeType;
        break;
      }
    }

    if (!base64Image) {
      context.log.warn("No image data returned", {
        partsCount: parts.length,
        hasInlineData: parts.some(
          (part) => (part.inlineData || part.inline_data)?.data
        ),
      });
      context.res = error("模型未回傳圖片資料", "no_image", 502);
      return;
    }

    context.res = ok({
      imageUrl: `data:${mimeType};base64,${base64Image}`,
      aspectRatio: aspectRatio || "16:9",
      prompt: finalPrompt,
    });
  } catch (err) {
    context.res = error("生成失敗", "generation_failed", 502);
  }
};
