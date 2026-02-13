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

  const { prompt, aspectRatio, imageSize, imageUrl } = req.body || {};
  if (!prompt) {
    context.res = error("缺少 prompt", "bad_request", 400);
    return;
  }

  try {
    const modelName = process.env.GEMINI_MODEL_GENERATION || "gemini-3-pro-image-preview";
    const model = getModel(modelName);
    const textPrompt = aspectRatio
      ? `${prompt}\nAspect ratio: ${aspectRatio}.`
      : prompt;

    const parts = [{ text: textPrompt }];

    if (imageUrl) {
      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error("Failed to fetch image");
        const arrayBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(arrayBuffer).toString("base64");
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";

        parts.push({
          inlineData: {
            mimeType: contentType,
            data: base64Image,
          },
        });
      } catch (imgErr) {
        context.log.warn("Failed to fetch reference image:", imgErr);
        // Continue without image or return error? 
        // Let's continue with just text but log warning
      }
    }

    const config = {
      responseModalities: ["TEXT", "IMAGE"],
      imageConfig: {
        ...(aspectRatio ? { aspectRatio } : {}),
        ...(imageSize ? { imageSize } : {}),
      },
    };

    const result = await model.generateContent(parts, config);

    const responseParts =
      result?.candidates?.[0]?.content?.parts ||
      result?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];
    let base64Image = null;
    let mimeType = "image/png";
    for (const part of responseParts) {
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
