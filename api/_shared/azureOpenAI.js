/**
 * Azure OpenAI Responses client.
 *
 * Endpoint, API key and deployment always come from the caller. Analysis models
 * are configured per tenant in the admin center (api/_shared/llmModels.js), so
 * this module never reads environment variables. Retries and the move to the
 * role's fallback model live in api/_shared/llmRuntime.js.
 */

const { createParser } = require("eventsource-parser");
const { INVALID_TOOL_CALL, OUTPUT_TRUNCATED } = require("./llmProviders");

class AzureOpenAIError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AzureOpenAIError";
    this.status = status;
  }
}

const getResponsesEndpoint = (configuredEndpoint) => {
  if (!configuredEndpoint) {
    throw new Error("分析模型缺少 Azure OpenAI 端點設定");
  }

  let url;
  try {
    url = new URL(configuredEndpoint);
  } catch {
    throw new Error("Azure OpenAI 端點格式無效");
  }

  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");

  if (/\/responses$/i.test(url.pathname)) {
    return url.toString();
  }

  const v1Index = url.pathname.toLowerCase().indexOf("/openai/v1");
  if (v1Index >= 0) {
    url.pathname = `${url.pathname.slice(0, v1Index + "/openai/v1".length)}/responses`;
  } else {
    url.pathname = `${url.pathname}/openai/v1/responses`;
  }

  return url.toString();
};

const parseResponseContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      return part?.text || part?.content || "";
    })
    .filter(Boolean)
    .join("\n");
};

const parseJsonContent = (content) => {
  const responseText = parseResponseContent(content).trim();
  if (!responseText) {
    throw new Error("Azure OpenAI 回傳空白內容");
  }

  const codeBlockMatch = responseText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  const cleanText = (codeBlockMatch ? codeBlockMatch[1] : responseText).trim();

  try {
    return JSON.parse(cleanText);
  } catch {
    const objectStart = cleanText.indexOf("{");
    const objectEnd = cleanText.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(cleanText.slice(objectStart, objectEnd + 1));
      } catch {
        // Fall through to a descriptive error below.
      }
    }
    throw new Error("Azure OpenAI 回傳不是有效的 JSON");
  }
};

const buildResponseInput = ({
  userMessage,
  imageDataUrl,
  fileDataUrl,
  fileName,
}) => {
  const jsonInstruction = `${userMessage}\n\nPlease return a valid JSON object only.`;
  if (!imageDataUrl && !fileDataUrl) {
    return jsonInstruction;
  }

  if (imageDataUrl && fileDataUrl) {
    throw new Error("Azure OpenAI 每次分析只能附加一個 image 或 file input");
  }

  const content = [
    {
      type: "input_text",
      text: jsonInstruction,
    },
  ];

  if (imageDataUrl) {
    content.push({
      type: "input_image",
      image_url: imageDataUrl,
      detail: "auto",
    });
  } else {
    content.push({
      type: "input_file",
      filename: fileName || "document.pdf",
      file_data: fileDataUrl,
    });
  }

  return [{ role: "user", content }];
};

const postJsonCompletion = async ({
  model,
  systemMessage,
  userMessage,
  imageDataUrl,
  fileDataUrl,
  fileName,
  maxOutputTokens,
}) => {
  const response = await fetch(getResponsesEndpoint(model.endpoint), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": model.apiKey,
    },
    body: JSON.stringify({
      model: model.modelName,
      instructions: systemMessage,
      input: buildResponseInput({
        userMessage,
        imageDataUrl,
        fileDataUrl,
        fileName,
      }),
      text: { format: { type: "json_object" } },
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
    }),
  });

  const rawText = await response.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || "Azure OpenAI 請求失敗";
    throw new AzureOpenAIError(`${message} (${response.status})`, response.status);
  }

  /**
   * Reasoning deployments answer with HTTP 200 even when the whole output
   * budget went into reasoning, leaving no message to parse. Say so instead of
   * reporting a malformed response, and mark it so the runtime can retry with
   * a larger budget — unless the deployment cut the answer well below the
   * budget we asked for, because then a larger budget changes nothing.
   */
  if (data?.status === "incomplete") {
    const reason = data?.incomplete_details?.reason || "unknown";
    const outputTokens = data?.usage?.output_tokens ?? 0;
    const reasoningTokens =
      data?.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    const cappedByDeployment =
      Boolean(maxOutputTokens) &&
      outputTokens > 0 &&
      outputTokens < maxOutputTokens * 0.9;
    const error = new AzureOpenAIError(
      cappedByDeployment
        ? `分析模型輸出 ${outputTokens} tokens 後即被部署截斷（要求上限 ${maxOutputTokens}），此部署的單次輸出長度不足以完成這次生成，請改指派其他模型`
        : `分析模型未在輸出上限 ${maxOutputTokens || "預設值"} 內完成回應（${reason}，推理用掉 ${reasoningTokens} tokens）`,
      response.status
    );
    if (!cappedByDeployment) {
      error.code = OUTPUT_TRUNCATED;
    }
    throw error;
  }

  const outputItems = Array.isArray(data?.output) ? data.output : [];
  const outputText = outputItems
    .filter((item) => item?.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part?.type === "output_text")
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n");
  const content = data?.output_text || outputText;
  if (!content) {
    throw new Error("Azure OpenAI 回傳格式異常：缺少訊息內容");
  }

  return parseJsonContent(content);
};

const readErrorMessage = async (response) => {
  const rawText = await response.text();
  try {
    const data = rawText ? JSON.parse(rawText) : null;
    return data?.error?.message || data?.message || "Azure OpenAI 請求失敗";
  } catch {
    return "Azure OpenAI 請求失敗";
  }
};

const parseToolArguments = (name, raw) => {
  try {
    const parsed = JSON.parse(raw || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    // Reported below.
  }
  const error = new Error(`對話模型的 ${name} 工具參數不是有效的 JSON`);
  error.code = INVALID_TOOL_CALL;
  throw error;
};

const MAX_SEARCH_SOURCES = 5;
const CITATION_START = "\ue200";
const CITATION_END = "\ue201";

/**
 * Web-search replies embed citation markers such as
 * `\ue200cite\ue202turn0search0\ue201` in the text, split across deltas. The
 * sources are returned separately, so the markers are dropped before any text
 * reaches the user.
 */
const createCitationFilter = () => {
  let inCitation = false;
  return (chunk) => {
    let out = "";
    for (const char of chunk) {
      if (char === CITATION_START) inCitation = true;
      else if (char === CITATION_END) inCitation = false;
      else if (!inCitation) out += char;
    }
    return out;
  };
};

const searchQuery = (action) => {
  const query = action?.query || action?.queries?.[0] || "";
  return typeof query === "string" ? query.trim() : "";
};

const searchSourceUrls = (action) => {
  const urls = action?.type === "open_page" && action.url
    ? [action.url]
    : (action?.sources || []).map((source) => source?.url);
  return [...new Set(urls.filter((url) => typeof url === "string" && /^https?:\/\//i.test(url)))];
};

/** Cited sources first, so the shown five include what the reply relied on. */
const toSources = (urls, citedTitles) =>
  [...urls]
    .sort((a, b) => Number(citedTitles.has(b)) - Number(citedTitles.has(a)))
    .slice(0, MAX_SEARCH_SOURCES)
    .map((url) => ({ url, title: citedTitles.get(url) || "" }));

/**
 * Streams one Responses API call. Text deltas go to `onTextDelta` as they
 * arrive; function calls are collected and returned only after the response
 * completes, so nothing acts on a call the model has not finished.
 *
 * With `maxWebSearches` above zero the hosted `web_search` tool is enabled.
 * Each search is reported to `onSearch` when it starts (`searching`, no query
 * yet) and when it ends (`completed` or `failed`, with its query and sources).
 * The returned `searches` also carry the titles the reply cited.
 */
const streamResponseCompletion = async ({
  model,
  systemMessage,
  messages,
  tools,
  maxWebSearches = 0,
  maxOutputTokens,
  signal,
  onTextDelta,
  onSearch = () => {},
}) => {
  const webSearch = maxWebSearches > 0;
  const response = await fetch(getResponsesEndpoint(model.endpoint), {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "api-key": model.apiKey,
    },
    body: JSON.stringify({
      model: model.modelName,
      instructions: systemMessage,
      input: messages.map(({ role, content }) => ({ role, content })),
      tools: [
        ...(webSearch ? [{ type: "web_search" }] : []),
        ...tools.map(({ name, description, parameters }) => ({
          type: "function",
          name,
          description,
          parameters,
          strict: false,
        })),
      ],
      ...(webSearch
        ? { include: ["web_search_call.action.sources"], max_tool_calls: maxWebSearches }
        : {}),
      tool_choice: "auto",
      parallel_tool_calls: true,
      stream: true,
      ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
    }),
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new AzureOpenAIError(`${message} (${response.status})`, response.status);
  }

  let text = "";
  const toolCalls = [];
  const searches = [];
  const citedTitles = new Map();
  const stripCitations = createCitationFilter();
  let finished = false;
  let failure = null;

  const parser = createParser({
    onEvent: ({ data }) => {
      if (!data || data === "[DONE]" || failure) return;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        failure = new AzureOpenAIError("Azure OpenAI 串流事件格式異常", 502);
        return;
      }
      switch (event.type) {
        case "response.output_text.delta": {
          const delta = event.delta ? stripCitations(event.delta) : "";
          if (delta) {
            text += delta;
            onTextDelta(delta);
          }
          break;
        }
        case "response.output_text.annotation.added": {
          const { annotation } = event;
          if (annotation?.type === "url_citation" && annotation.url && annotation.title) {
            citedTitles.set(annotation.url, annotation.title);
          }
          break;
        }
        case "response.output_item.added":
          if (event.item?.type === "web_search_call") {
            const search = { id: event.item.id, status: "searching", query: "", urls: [] };
            searches.push(search);
            onSearch({ id: search.id, status: search.status, query: "", sources: [] });
          }
          break;
        case "response.output_item.done":
          if (event.item?.type === "function_call") {
            toolCalls.push({
              name: event.item.name,
              arguments: parseToolArguments(event.item.name, event.item.arguments),
            });
          } else if (event.item?.type === "web_search_call") {
            const search = searches.find((item) => item.id === event.item.id);
            if (search) {
              search.status = event.item.status === "completed" ? "completed" : "failed";
              search.query = searchQuery(event.item.action);
              search.urls = searchSourceUrls(event.item.action);
              onSearch({
                id: search.id,
                status: search.status,
                query: search.query,
                sources: toSources(search.urls, citedTitles),
              });
            }
          }
          break;
        case "response.completed":
          finished = true;
          break;
        case "response.incomplete": {
          const reason = event.response?.incomplete_details?.reason || "unknown";
          failure = new AzureOpenAIError(`對話模型未完成回應（${reason}）`, 200);
          failure.code = OUTPUT_TRUNCATED;
          break;
        }
        case "response.failed":
        case "error": {
          const detail = event.response?.error || event.error || event;
          failure = new AzureOpenAIError(
            detail?.message || "Azure OpenAI 串流失敗",
            Number(detail?.status) || 502
          );
          break;
        }
        default:
          break;
      }
    },
  });

  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    parser.feed(decoder.decode(chunk, { stream: true }));
    if (failure) throw failure;
  }
  parser.feed(decoder.decode());
  if (failure) throw failure;
  if (!finished) {
    throw new AzureOpenAIError("Azure OpenAI 串流在完成前中斷", 502);
  }

  return {
    text,
    toolCalls,
    searches: searches.map(({ id, status, query, urls }) => ({
      id,
      // A search the stream never closed did not finish.
      status: status === "searching" ? "failed" : status,
      query,
      sources: toSources(urls, citedTitles),
    })),
  };
};

module.exports = {
  buildResponseInput,
  parseJsonContent,
  postJsonCompletion,
  getResponsesEndpoint,
  streamResponseCompletion,
};
