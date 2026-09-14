const { isPublicHttpsEndpoint } = require("./urlValidator");

const IMAGE_API_TYPES = Object.freeze([
  { id: "azure-openai-images-v1", label: "Azure OpenAI Images v1" },
]);
const IMAGE_QUALITIES = Object.freeze(["low", "medium", "high", "xhigh", "max", "auto"]);

class ImageModelError extends Error {
  constructor(message, code = "bad_request", status = 400) {
    super(message);
    this.name = "ImageModelError";
    this.code = code;
    this.status = status;
    this.retryable = false;
  }
}

const TRANSIENT_IO_CODES = new Set([
  "ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET",
]);

const isTransientImageError = (error) => {
  if (error?.retryable === false) return false;
  if (error?.retryable === true) return true;
  const status = error?.statusCode ?? error?.status;
  if (Number.isInteger(status)) {
    return status === 408 || status === 429 || (status >= 500 && status <= 599);
  }
  return TRANSIENT_IO_CODES.has(error?.code) || TRANSIENT_IO_CODES.has(error?.cause?.code);
};

const normalizeImageEndpoint = (value) => {
  if (typeof value !== "string" || !isPublicHttpsEndpoint(value.trim())) {
    throw new ImageModelError("請填寫有效的 Azure HTTPS 圖片端點");
  }
  const url = new URL(value.trim());
  const isAzure = [
    ".openai.azure.com",
    ".cognitiveservices.azure.com",
    ".services.ai.azure.com",
  ].some((suffix) => url.hostname.endsWith(suffix));
  const paths = ["/", "/openai/v1", "/openai/v1/", "/openai/v1/images/generations"];
  if (
    !isAzure || url.username || url.password || url.search || url.hash ||
    (url.port && url.port !== "443") || !paths.includes(url.pathname)
  ) {
    throw new ImageModelError("端點必須是 Azure Images v1 網址，不可包含帳密、查詢參數或其他路徑");
  }
  return `${url.origin}/openai/v1`;
};

const validateImageQuality = (model, value) => {
  const quality = value === undefined ? model.defaultQuality : value;
  if (
    typeof quality !== "string" ||
    !IMAGE_QUALITIES.includes(quality) ||
    !model.supportedQualities?.includes(quality)
  ) {
    throw new ImageModelError("目前圖片模型不支援此品質，請重新選擇");
  }
  return quality;
};

module.exports = {
  IMAGE_API_TYPES,
  IMAGE_QUALITIES,
  ImageModelError,
  isTransientImageError,
  normalizeImageEndpoint,
  validateImageQuality,
};
