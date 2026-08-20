/**
 * Provider-agnostic JSON completion runtime.
 *
 * Every analysis role can be assigned any tenant-configured model, so the
 * caller describes the request once (system message, user message, optional
 * attachment) and this module dispatches to the client the assigned model
 * needs. Retries also live here: the peer model may belong to a different
 * provider than the primary one.
 */

const { postJsonCompletion } = require("./azureOpenAI");
const { postGeminiJson } = require("./gemini");
const { PROVIDERS } = require("./llmProviders");

/**
 * GlobalStandard deployments reject oversized requests during peak load with
 * HTTP 429 ("your request exceeds the maximum usage size allowed"). That
 * verdict is about the size of this request, not about how often we call, so
 * every retry also shrinks the output budget and moves to the peer model.
 */
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2000;
const MIN_RETRY_OUTPUT_TOKENS = 8000;

const isRetryableStatus = (status) => status === 429 || status >= 500;

const shrinkOutputTokens = (tokens) =>
  tokens ? Math.max(MIN_RETRY_OUTPUT_TOKENS, Math.floor(tokens * 0.6)) : tokens;

const retryDelayMs = (attempt) =>
  RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requireModel = (model, label) => {
  if (!model?.modelName) {
    throw new Error(`${label}缺少模型名稱`);
  }
  if (!model.apiKey) {
    throw new Error(`${label}缺少 API 金鑰`);
  }
  if (model.provider === PROVIDERS.AZURE_OPENAI && !model.endpoint) {
    throw new Error(`${label}缺少 Azure OpenAI 端點`);
  }
  return model;
};

const toDataUrl = (attachment) =>
  `data:${attachment.mimeType};base64,${attachment.base64}`;

const callModel = async (model, request, maxOutputTokens) => {
  const { systemMessage, userMessage, attachment, fileName } = request;

  if (model.provider === PROVIDERS.GOOGLE_GEMINI) {
    return postGeminiJson({
      model,
      systemMessage,
      userMessage,
      attachment,
      maxOutputTokens,
    });
  }

  const isPdf = attachment?.mimeType === "application/pdf";
  return postJsonCompletion({
    model,
    systemMessage,
    userMessage,
    imageDataUrl: attachment && !isPdf ? toDataUrl(attachment) : undefined,
    fileDataUrl: attachment && isPdf ? toDataUrl(attachment) : undefined,
    fileName,
    maxOutputTokens,
  });
};

/**
 * @param {object} params
 * @param {{ model: object, fallback: object|null }} params.llm Resolved role assignment.
 * @param {string} params.systemMessage
 * @param {string} params.userMessage
 * @param {{ mimeType: string, base64: string }} [params.attachment]
 * @param {string} [params.fileName]
 * @param {number} [params.maxOutputTokens]
 */
const generateJson = async ({
  llm,
  systemMessage,
  userMessage,
  attachment,
  fileName,
  maxOutputTokens,
}) => {
  let activeModel = requireModel(llm?.model, "主要分析模型");
  const fallbackModel = llm?.fallback
    ? requireModel(llm.fallback, "備援分析模型")
    : null;
  let activeMaxOutputTokens = maxOutputTokens;
  const request = { systemMessage, userMessage, attachment, fileName };

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await callModel(activeModel, request, activeMaxOutputTokens);
    } catch (error) {
      if (attempt >= RETRY_ATTEMPTS || !isRetryableStatus(error.status)) throw error;

      activeMaxOutputTokens = shrinkOutputTokens(activeMaxOutputTokens);
      if (fallbackModel && activeModel.id !== fallbackModel.id) {
        activeModel = fallbackModel;
      }
      console.warn("[llmRuntime] Retrying rejected request:", {
        attempt,
        status: error.status,
        provider: activeModel.provider,
        model: activeModel.modelName,
        maxOutputTokens: activeMaxOutputTokens,
      });
      await sleep(retryDelayMs(attempt));
    }
  }
};

module.exports = {
  generateJson,
};
