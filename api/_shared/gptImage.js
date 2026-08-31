const ASPECT_RATIO_TO_SIZE = Object.freeze({
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "9:16": "1024x1536",
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

/** Azure `images/generations` rendering effort; higher costs more and is slower. */
const IMAGE_QUALITIES = Object.freeze(["low", "medium", "high"]);
const DEFAULT_IMAGE_QUALITY = "medium";

const normalizeImageQuality = (value) => {
  const quality = String(value || "").trim().toLowerCase();
  return IMAGE_QUALITIES.includes(quality) ? quality : DEFAULT_IMAGE_QUALITY;
};

/** Upstream is busy or briefly broken; the same request is worth repeating. */
const isTransientStatus = (status) => status === 429 || status >= 500;

const getEndpoint = () => process.env.GPT_IMAGE_ENDPOINT || "";
const getApiKey = () => process.env.GPT_IMAGE_API_KEY || "";
const getDeployment = () => process.env.GPT_IMAGE_DEPLOYMENT || "gpt-image-2";

const isAzureOpenAiEndpoint = (endpoint) => {
  try {
    const { hostname } = new URL(endpoint);
    return (
      hostname.endsWith(".openai.azure.com") ||
      hostname.endsWith(".cognitiveservices.azure.com") ||
      hostname.endsWith(".services.ai.azure.com")
    );
  } catch {
    return false;
  }
};

const deriveEditEndpoint = (endpoint) => {
  if (!endpoint) return "";

  try {
    const url = new URL(endpoint);
    if (url.pathname.includes("/images/generations")) {
      url.pathname = url.pathname.replace("/images/generations", "/images/edits");
      return url.toString();
    }
    return endpoint;
  } catch {
    return endpoint.replace(/\/images\/generations([^/]*)$/, "/images/edits$1");
  }
};

const getAuthHeaders = (endpoint) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("GPT_IMAGE_API_KEY 尚未設定");
  }

  return isAzureOpenAiEndpoint(endpoint)
    ? { "api-key": apiKey }
    : { Authorization: `Bearer ${apiKey}` };
};

const parseResponse = async (response, label) => {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error?.message || data?.message || `${label} 請求失敗`;
    const failure = new Error(`${message} (${response.status})`);
    failure.status = response.status;
    throw failure;
  }

  const item = data?.data?.[0];
  if (!item?.b64_json && !item?.url) {
    throw new Error(`${label} 回傳格式異常：缺少圖片資料`);
  }

  return {
    imageUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url,
  };
};

const getSize = (aspectRatio) =>
  ASPECT_RATIO_TO_SIZE[aspectRatio] || ASPECT_RATIO_TO_SIZE["1:1"];

/**
 * Generate one image, retrying with exponential backoff while the endpoint
 * reports throttling or a server-side failure. A retry-exhausted call still
 * throws: the caller decides what a missing image means.
 */
const generateGptImage = async ({ prompt, aspectRatio, quality }) => {
  const endpoint = getEndpoint();
  if (!endpoint) throw new Error("GPT_IMAGE_ENDPOINT 尚未設定");

  let delayMs = RETRY_BASE_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(endpoint),
        },
        body: JSON.stringify({
          prompt,
          model: getDeployment(),
          size: getSize(aspectRatio),
          quality: normalizeImageQuality(quality),
          n: 1,
        }),
      });

      return await parseResponse(response, "GPT Image 2");
    } catch (apiError) {
      if (attempt >= MAX_RETRIES || !isTransientStatus(apiError.status)) throw apiError;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
};

const editGptImage = async ({ imageBase64, mimeType, prompt, aspectRatio, quality }) => {
  const endpoint = deriveEditEndpoint(
    process.env.GPT_IMAGE_EDIT_ENDPOINT || getEndpoint()
  );
  if (!endpoint) throw new Error("GPT_IMAGE_EDIT_ENDPOINT 尚未設定");
  if (!imageBase64) throw new Error("缺少 GPT Image 2 編輯來源圖片");

  let delayMs = RETRY_BASE_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    const formData = new FormData();
    formData.append(
      isAzureOpenAiEndpoint(endpoint) ? "image[]" : "image",
      new Blob([Buffer.from(imageBase64, "base64")], {
        type: mimeType || "image/png",
      }),
      "source.png"
    );
    formData.append("prompt", prompt || "");
    formData.append("model", getDeployment());
    formData.append("size", getSize(aspectRatio));
    formData.append("quality", normalizeImageQuality(quality));
    formData.append("n", "1");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: getAuthHeaders(endpoint),
        body: formData,
      });

      return await parseResponse(response, "GPT Image 2 Edit");
    } catch (apiError) {
      if (attempt >= MAX_RETRIES || !isTransientStatus(apiError.status)) throw apiError;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
};

module.exports = {
  DEFAULT_IMAGE_QUALITY,
  IMAGE_QUALITIES,
  deriveEditEndpoint,
  editGptImage,
  generateGptImage,
  normalizeImageQuality,
};
