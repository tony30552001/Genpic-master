/**
 * Analysis-model runtime.
 *
 * Every analysis role is assigned a tenant-configured Azure OpenAI model. The
 * caller describes the request once (system message, user message, optional
 * attachment); retries and the move to the role's fallback model live here,
 * while api/_shared/azureOpenAI.js only performs single requests.
 */

const { postJsonCompletion, streamResponseCompletion } = require("./azureOpenAI");
const { INVALID_TOOL_CALL, OUTPUT_TRUNCATED } = require("./llmProviders");

/**
 * GlobalStandard deployments reject oversized requests during peak load with
 * HTTP 429 ("your request exceeds the maximum usage size allowed"). That
 * verdict is about the size of this request, not about how often we call, so
 * every retry also shrinks the output budget and moves to the peer model.
 *
 * Truncation is the opposite problem: a reasoning model answered but spent the
 * whole budget on reasoning, so those retries grow the budget on the same
 * model instead.
 */
const RETRY_ATTEMPTS = 4;
const RETRY_BASE_DELAY_MS = 2000;
const MIN_RETRY_OUTPUT_TOKENS = 8000;
const MAX_RETRY_OUTPUT_TOKENS = 32000;

const isRetryableStatus = (status) => status === 429 || status >= 500;

const shrinkOutputTokens = (tokens) =>
  tokens ? Math.max(MIN_RETRY_OUTPUT_TOKENS, Math.floor(tokens * 0.6)) : tokens;

const growOutputTokens = (tokens) =>
  Math.min(MAX_RETRY_OUTPUT_TOKENS, (tokens || MIN_RETRY_OUTPUT_TOKENS) * 2);

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
  if (!model.endpoint) {
    throw new Error(`${label}缺少 Azure OpenAI 端點`);
  }
  return model;
};

const toDataUrl = (attachment) =>
  `data:${attachment.mimeType};base64,${attachment.base64}`;

const callModel = async (model, request, maxOutputTokens) => {
  const { systemMessage, userMessage, attachment, fileName } = request;
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
      if (attempt >= RETRY_ATTEMPTS) throw error;

      if (error.code === OUTPUT_TRUNCATED) {
        if (activeMaxOutputTokens >= MAX_RETRY_OUTPUT_TOKENS) throw error;
        activeMaxOutputTokens = growOutputTokens(activeMaxOutputTokens);
        console.warn("[llmRuntime] Retrying truncated response:", {
          attempt,
          model: activeModel.modelName,
          maxOutputTokens: activeMaxOutputTokens,
        });
        continue;
      }

      if (!isRetryableStatus(error.status)) throw error;

      activeMaxOutputTokens = shrinkOutputTokens(activeMaxOutputTokens);
      if (fallbackModel && activeModel.id !== fallbackModel.id) {
        activeModel = fallbackModel;
      }
      console.warn("[llmRuntime] Retrying rejected request:", {
        attempt,
        status: error.status,
        model: activeModel.modelName,
        maxOutputTokens: activeMaxOutputTokens,
      });
      await sleep(retryDelayMs(attempt));
    }
  }
};

/** Keeps a streamed reply, including retries, inside the SWA 45-second request limit. */
const STREAM_DEADLINE_MS = 40_000;
const STREAM_ATTEMPTS = 3;
const STREAM_RETRY_DELAY_MS = 500;

class LlmStreamError extends Error {
  constructor(message, code, { cause, partial = false } = {}) {
    super(message, { cause });
    this.name = "LlmStreamError";
    this.code = code;
    this.partial = partial;
  }
}

/**
 * Streams one reply that may carry tool calls, as `{ text, reasoning, toolCalls, searches }`.
 *
 * Retries and the fallback model are only used before anything reached the
 * user through `onTextDelta`, `onReasoningDelta` or `onSearch`: once the user has seen part of an
 * answer, it is never replaced by another model's answer. `signal` aborts the
 * call; the deadline aborts it with a `llm_timeout` error.
 *
 * @param {object} params
 * @param {{ model: object, fallback: object|null }} params.llm Resolved role assignment.
 * @param {string} params.systemMessage
 * @param {{ role: "user"|"assistant", content: string }[]} params.messages
 * @param {{ name: string, description: string, parameters: object }[]} params.tools
 * @param {(text: string) => void} params.onTextDelta
 * @param {(text: string) => void} [params.onReasoningDelta] Receives each reasoning-summary fragment.
 * @param {number} [params.maxWebSearches] Hosted web searches allowed in this reply; 0 disables the tool.
 * @param {(search: object) => void} [params.onSearch] Receives each web-search progress update.
 * @param {AbortSignal} [params.signal]
 * @param {number} [params.maxOutputTokens]
 * @param {number} [params.deadlineMs]
 */
const streamResponse = async ({
  llm,
  systemMessage,
  messages,
  tools,
  onTextDelta,
  onReasoningDelta,
  maxWebSearches = 0,
  onSearch,
  signal,
  maxOutputTokens,
  deadlineMs = STREAM_DEADLINE_MS,
}) => {
  let activeModel = requireModel(llm?.model, "主要對話模型");
  const fallbackModel = llm?.fallback ? requireModel(llm.fallback, "備援對話模型") : null;
  const deadline = AbortSignal.timeout(deadlineMs);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let emitted = false;
  const request = {
    systemMessage,
    messages,
    tools,
    maxWebSearches,
    maxOutputTokens,
    signal: combined,
    onTextDelta: (text) => {
      emitted = true;
      onTextDelta(text);
    },
    onSearch: (search) => {
      emitted = true;
      onSearch?.(search);
    },
    onReasoningDelta: (text) => {
      emitted = true;
      onReasoningDelta?.(text);
    },
  };

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await streamResponseCompletion({ model: activeModel, ...request });
    } catch (error) {
      if (deadline.aborted) {
        throw new LlmStreamError("對話模型回覆逾時，請稍後重試", "llm_timeout", {
          cause: error,
          partial: emitted,
        });
      }
      if (signal?.aborted) {
        throw new LlmStreamError("回覆已停止", "aborted", { cause: error, partial: emitted });
      }
      if (emitted || attempt >= STREAM_ATTEMPTS || !isRetryableStatus(error.status)) {
        throw new LlmStreamError(
          error.code === OUTPUT_TRUNCATED
            ? "對話模型的回覆被截斷，請縮短需求後重試"
            : error.code === INVALID_TOOL_CALL
              ? "對話模型回傳的動作無效，未建立圖片工作"
              : "對話模型暫時無法回覆，請稍後重試",
          error.code === OUTPUT_TRUNCATED || error.code === INVALID_TOOL_CALL
            ? error.code
            : "llm_failed",
          { cause: error, partial: emitted }
        );
      }
      if (fallbackModel && activeModel.id !== fallbackModel.id) {
        activeModel = fallbackModel;
      }
      console.warn("[llmRuntime] Retrying stream before first token:", {
        attempt,
        status: error.status,
        model: activeModel.modelName,
      });
      await sleep(STREAM_RETRY_DELAY_MS * attempt);
    }
  }
};

module.exports = {
  LlmStreamError,
  generateJson,
  streamResponse,
};
