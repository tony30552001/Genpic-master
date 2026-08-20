const { generateGeminiImage } = require("./geminiImage");
const { generateGptImage } = require("./gptImage");
const { fetchImageSource } = require("./blobStorage");

/**
 * One place that turns a tenant's image model into image bytes.
 *
 * The two providers disagree on their return shape: Gemini hands back inline
 * base64, GPT Image 2 hands back a data URL or a short-lived remote URL.
 * Callers that need to store or forward the picture only care about bytes.
 */
const RENDERERS = {
  "gemini-imagen": async ({ prompt, aspectRatio }) => {
    const image = await generateGeminiImage({ prompt, aspectRatio });
    return {
      buffer: Buffer.from(image.base64, "base64"),
      contentType: image.mimeType || "image/png",
    };
  },
  "gpt-image-2": async ({ prompt, aspectRatio }) => {
    const { imageUrl } = await generateGptImage({ prompt, aspectRatio });
    return fetchImageSource(imageUrl);
  },
};

/** Whether this deployment can actually call the model right now. */
const isImageModelConfigured = (model) => {
  if (model === "gpt-image-2") {
    return Boolean(process.env.GPT_IMAGE_ENDPOINT && process.env.GPT_IMAGE_API_KEY);
  }
  if (model === "gemini-imagen") {
    return Boolean(process.env.GOOGLE_API_KEY);
  }
  return false;
};

const renderImage = async ({ model, prompt, aspectRatio }) => {
  const render = RENDERERS[model];
  if (!render) {
    throw new Error(`不支援的圖片生成模型：${model}`);
  }
  return render({ prompt, aspectRatio });
};

module.exports = { isImageModelConfigured, renderImage };
