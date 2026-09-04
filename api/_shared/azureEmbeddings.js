/**
 * Text embeddings through the Azure AI Foundry model inference endpoint.
 *
 * `embed-v-4-0` is a Matryoshka model, so every request pins the output width
 * to the dimension the styles catalog stores in its `vector` column instead of
 * trusting the deployment default. Cohere embedding models are asymmetric:
 * text stored for retrieval and text typed as a search query must be embedded
 * under different input types or the cosine distances stop being comparable.
 */

const { defaultDim } = require("./vector");

const DEFAULT_MODEL_NAME = "embed-v-4-0";
const DEFAULT_API_VERSION = "2024-05-01-preview";
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

const INPUT_TYPES = Object.freeze({
  DOCUMENT: "document",
  QUERY: "query",
});

/** Upstream is busy or briefly broken; the same request is worth repeating. */
const isTransientStatus = (status) => status === 429 || status >= 500;

const getModelName = () => process.env.EMBEDDING_MODEL || DEFAULT_MODEL_NAME;

/**
 * Accepts either the resource root or the full target URI copied from the
 * deployment page, and always ends on the versioned embeddings route.
 */
const resolveEmbeddingsEndpoint = (rawEndpoint) => {
  const configured = String(rawEndpoint || "").trim();
  if (!configured) {
    throw new Error("AZURE_EMBEDDING_ENDPOINT 尚未設定");
  }

  let url;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("AZURE_EMBEDDING_ENDPOINT 不是合法的網址");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/embeddings")) {
    url.pathname = `${path}/embeddings`;
  }
  if (!url.searchParams.has("api-version")) {
    url.searchParams.set("api-version", DEFAULT_API_VERSION);
  }

  return url.toString();
};

const parseEmbedding = (payload) => {
  const values = payload?.data?.[0]?.embedding;
  if (!Array.isArray(values)) {
    throw new Error("Embedding 回傳格式異常：缺少向量資料");
  }
  if (values.length !== defaultDim) {
    throw new Error(
      `Embedding 維度不符：預期 ${defaultDim}，實際 ${values.length}`
    );
  }
  if (!values.every((value) => Number.isFinite(value))) {
    throw new Error("Embedding 含非數字");
  }
  return values;
};

const readResponse = async (response) => {
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.error?.message || payload?.message || "Embedding 請求失敗";
    const failure = new Error(`${message} (${response.status})`);
    failure.status = response.status;
    throw failure;
  }

  return parseEmbedding(payload);
};

/**
 * Embed one string, retrying with exponential backoff while the endpoint
 * reports throttling or a server-side failure.
 *
 * @param {object} params
 * @param {string} params.text
 * @param {string} params.inputType One of INPUT_TYPES.
 * @returns {Promise<number[]>}
 */
const embedText = async ({ text, inputType }) => {
  const content = String(text || "").trim();
  if (!content) {
    throw new Error("缺少要建立向量的文字");
  }

  const endpoint = resolveEmbeddingsEndpoint(process.env.AZURE_EMBEDDING_ENDPOINT);
  const apiKey = process.env.AZURE_EMBEDDING_API_KEY;
  if (!apiKey) {
    throw new Error("AZURE_EMBEDDING_API_KEY 尚未設定");
  }

  let delayMs = RETRY_BASE_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          input: [content],
          model: getModelName(),
          dimensions: defaultDim,
          input_type: inputType,
        }),
      });

      return await readResponse(response);
    } catch (apiError) {
      if (attempt >= MAX_RETRIES || !isTransientStatus(apiError.status)) {
        throw apiError;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs *= 2;
    }
  }
};

module.exports = {
  INPUT_TYPES,
  embedText,
  resolveEmbeddingsEndpoint,
};
