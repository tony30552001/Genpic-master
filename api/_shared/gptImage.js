const {
  ImageModelError,
  isTransientImageError,
  normalizeImageEndpoint,
  validateImageQuality,
} = require("./imageModelConfig");

const sharp = require("sharp");

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

const MAX_EDIT_SOURCE_EDGE = 2048;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 2000;
// Includes response streaming and retry delays, below the worker's 15-minute lease.
const REQUEST_TIMEOUT_MS = 12 * 60 * 1000;

class ImageProviderError extends Error {
  constructor(message, code, status, retryable) {
    super(message);
    this.name = "ImageProviderError";
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

// Only the provider's error code and moderation stage are read; its message may echo request data.
const readProviderError = async (response) => {
  try {
    const error = JSON.parse(await response.text())?.error;
    return { code: error?.code, stage: error?.moderation_details?.moderation_stage };
  } catch {
    return {};
  }
};

const providerFailure = ({ code, stage }, status) => {
  if (code === "moderation_blocked") {
    const failure = new ImageProviderError(
      stage === "output" ? "生成結果被安全審查擋下，請調整描述後再試" : "描述內容被安全審查擋下，請調整描述後再試",
      "image_moderation_blocked", status, false
    );
    failure.moderationStage = stage;
    return failure;
  }
  if (code === "content_filter") {
    return new ImageProviderError("內容被安全政策擋下，請調整描述後再試", "image_content_filtered", status, false);
  }
  if (code === "invalid_image_file") {
    return new ImageProviderError("圖片檔無法處理，請改用其他圖片", "invalid_source_image", status, false);
  }
  return new ImageProviderError(`圖片服務請求失敗 (${status})`, "image_provider_error", status, false);
};

const parseResponse = async (response) => {
  if (!response.ok) {
    if (isTransientImageError({ status: response.status })) {
      await response.body?.cancel();
      throw new ImageProviderError(
        `圖片服務請求失敗 (${response.status})`, "image_provider_error", response.status, true
      );
    }
    throw providerFailure(await readProviderError(response), response.status);
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
        // Output-stage moderation is probabilistic, so a fresh render often passes. It stays
        // non-retryable for the job queue so attempts are bounded here.
        const retry = failure.retryable || failure.moderationStage === "output";
        if (attempt >= MAX_RETRIES || !retry) throw failure;
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

// Re-encoding drops container metadata the provider rejects as invalid_image_file
// (e.g. the MPF index in iPhone JPEGs) and bounds the upload size.
const normalizeEditSource = async (imageBase64) => {
  try {
    return await sharp(Buffer.from(imageBase64, "base64"))
      .rotate()
      .resize({
        width: MAX_EDIT_SOURCE_EDGE,
        height: MAX_EDIT_SOURCE_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw new ImageModelError("無法解析上傳的圖片，請改用其他圖片檔", "invalid_source_image", 400);
  }
};

const editGptImage = async ({ config, imageBase64, prompt, aspectRatio, quality }) => {
  validateConfig(config);
  const selectedQuality = validateImageQuality(config, quality);
  if (typeof imageBase64 !== "string" || !imageBase64) {
    throw new ImageModelError("缺少圖片編輯來源");
  }
  const source = await normalizeEditSource(imageBase64);
  return requestImage(config, "edits", () => {
    const formData = new FormData();
    formData.append("image", new Blob([source], { type: "image/png" }), "source.png");
    formData.append("prompt", prompt || "");
    formData.append("model", config.deploymentName);
    formData.append("size", getSize(aspectRatio));
    formData.append("quality", selectedQuality);
    formData.append("output_format", "png");
    formData.append("n", "1");
    return { headers: { "api-key": config.apiKey }, body: formData };
  });
};

const ASPECT_RATIOS = Object.freeze(Object.keys(ASPECT_RATIO_TO_SIZE));

module.exports = {
  ASPECT_RATIOS,
  ImageProviderError,
  editGptImage,
  generateGptImage,
};
