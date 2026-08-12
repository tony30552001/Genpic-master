const { getModel } = require("./gemini");

const DEFAULT_MODEL_NAME =
  process.env.GEMINI_MODEL_GENERATION || "gemini-3.1-flash-image-preview";
const MAX_RETRIES = 2;

const isOverloadError = (candidate) => {
  const message = String(candidate?.message || candidate);
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.includes("UNAVAILABLE") ||
    message.includes("high demand")
  );
};

const extractInlineImage = (result) => {
  const parts =
    result?.candidates?.[0]?.content?.parts ||
    result?.parts ||
    result?.response?.candidates?.[0]?.content?.parts ||
    [];

  for (const part of parts) {
    const inlineData = part.inlineData || part.inline_data;
    if (inlineData?.data) {
      return {
        base64: inlineData.data,
        mimeType: inlineData.mimeType || inlineData.mime_type || "image/png",
      };
    }
  }
  return null;
};

/**
 * Generate one image with the Gemini image model, retrying with exponential
 * backoff while the upstream service reports overload.
 */
const generateGeminiImage = async ({
  prompt,
  aspectRatio,
  imageSize,
  referenceImage,
  logger,
}) => {
  const model = getModel(DEFAULT_MODEL_NAME);
  const textPrompt = aspectRatio ? `${prompt}\nAspect ratio: ${aspectRatio}.` : prompt;
  const parts = [{ text: textPrompt }];

  if (referenceImage?.base64) {
    parts.push({
      inlineData: {
        mimeType: referenceImage.mimeType || "image/jpeg",
        data: referenceImage.base64,
      },
    });
  }

  const config = {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {
      ...(aspectRatio ? { aspectRatio } : {}),
      ...(imageSize ? { imageSize } : {}),
    },
  };

  let result;
  let delayMs = 2000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      result = await model.generateContent(parts, config);
      break;
    } catch (apiError) {
      if (attempt >= MAX_RETRIES || !isOverloadError(apiError)) throw apiError;
      logger?.warn?.(
        `AI API overload (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }

  const image = extractInlineImage(result);
  if (!image) {
    throw new Error("模型未回傳圖片資料");
  }

  return { ...image, prompt: textPrompt };
};

module.exports = { DEFAULT_MODEL_NAME, generateGeminiImage, isOverloadError };
