/**
 * Azure OpenAI Responses client.
 *
 * Endpoint, API key and deployment always come from the caller. Analysis models
 * are configured per tenant in the admin center (api/_shared/llmModels.js), so
 * this module never reads environment variables. Retries and peer-model
 * failover live in api/_shared/llmRuntime.js because a role may fail over to a
 * model from another provider.
 */

const { OUTPUT_TRUNCATED } = require("./llmProviders");

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

module.exports = {
  buildResponseInput,
  parseJsonContent,
  postJsonCompletion,
  getResponsesEndpoint,
};
