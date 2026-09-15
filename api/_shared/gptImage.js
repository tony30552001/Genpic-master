const {
  ImageModelError,
  isTransientImageError,
  normalizeImageEndpoint,
  validateImageQuality,
} = require("./imageModelConfig");

const ASPECT_RATIO_TO_SIZE = Object.freeze({
  "1:1": "1024x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:3": "1360x1024",
  "3:4": "768x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
  "5:4": "1280x1024",
  "4:5": "1024x1280",
  "21:9": "1792x768",
});

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
// Includes response streaming and retry delays, below the worker's 15-minute lease.
const REQUEST_TIMEOUT_MS = 12 * 60 * 1000;

class ImageProviderError extends Error {
  constructor(message, code, status, retryable) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

const validateConfig = (config) => {
  if (
    !config || config.apiType !== "azure-openai-images-v1" ||
    typeof config.apiKey !== "string" || !config.apiKey.trim() ||
    typeof config.deploymentName !== "string" || !config.deploymentName.trim() ||
    normalizeImageEndpoint(config.endpoint) !== config.endpoint
  ) {
    throw new ImageModelError(
      "圖片模型設定無效，請聯絡管理員", "image_model_not_configured", 503
    );
  }
};

const parseResponse = async (response) => {
  if (!response.ok) {
    await response.body?.cancel();
    throw new ImageProviderError(
      `圖片服務請求失敗 (${response.status})`,
      "image_provider_error", response.status, isTransientImageError({ status: response.status })
    );
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImageProviderError("圖片服務回傳格式異常", "image_provider_response", 502, false);
  }
  const item = data?.data?.[0];
  if (typeof item?.b64_json !== "string" || !item.b64_json) {
    throw new ImageProviderError("圖片服務回傳格式異常：缺少圖片資料", "image_provider_response", 502, false);
  }
  return { imageUrl: `data:image/png;base64,${item.b64_json}` };
};

const getSize = (aspectRatio) =>
  ASPECT_RATIO_TO_SIZE[aspectRatio] || ASPECT_RATIO_TO_SIZE["1:1"];

const requestImage = async (config, route, makeRequest) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        controller.signal.throwIfAborted();
        const response = await fetch(`${config.endpoint}/images/${route}`, {
          ...makeRequest(),
          method: "POST",
          redirect: "error",
          signal: controller.signal,
        });
        return await parseResponse(response);
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ImageProviderError("圖片服務請求逾時", "image_provider_timeout", 504, true);
        }
        // Never propagate fetch errors or provider response bodies containing credentials.
        const failure = error instanceof ImageProviderError ? error :
          new ImageProviderError("圖片服務連線失敗", "image_provider_connection", 502,
            isTransientImageError(error));
        if (attempt >= MAX_RETRIES || !failure.retryable) throw failure;
        await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
      }
    }
  } finally {
    clearTimeout(timer);
  }
};

const generateGptImage = async ({ config, prompt, aspectRatio, quality }) => {
  validateConfig(config);
  const selectedQuality = validateImageQuality(config, quality);
  return requestImage(config, "generations", () => ({
    headers: { "Content-Type": "application/json", "api-key": config.apiKey },
    body: JSON.stringify({
      prompt,
      model: config.deploymentName,
      size: getSize(aspectRatio),
      quality: selectedQuality,
      output_format: "png",
      n: 1,
    }),
  }));
};

const editGptImage = async ({ config, imageBase64, mimeType, prompt, aspectRatio, quality }) => {
  validateConfig(config);
  const selectedQuality = validateImageQuality(config, quality);
  if (typeof imageBase64 !== "string" || !imageBase64) {
    throw new ImageModelError("缺少圖片編輯來源");
  }
  return requestImage(config, "edits", () => {
    const formData = new FormData();
    formData.append(
      "image",
      new Blob([Buffer.from(imageBase64, "base64")], {
        type: mimeType || "image/png",
      }),
      "source.png"
    );
    formData.append("prompt", prompt || "");
    formData.append("model", config.deploymentName);
    formData.append("size", getSize(aspectRatio));
    formData.append("quality", selectedQuality);
    formData.append("output_format", "png");
    formData.append("n", "1");
    return { headers: { "api-key": config.apiKey }, body: formData };
  });
};

module.exports = {
  editGptImage,
  generateGptImage,
};
