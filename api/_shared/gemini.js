const { GoogleGenAI } = require("@google/genai");

const { INVALID_TOOL_CALL, OUTPUT_TRUNCATED } = require("./llmProviders");

const getClient = (apiKey) => {
  if (!apiKey) {
    throw new Error("Missing Gemini API key");
  }
  return new GoogleGenAI({ apiKey });
};

const getModel = (modelName, apiKey) => {
  const client = getClient(apiKey);
  return {
    generateContent: (contents, config) =>
      client.models.generateContent({
        model: modelName,
        contents,
        config,
      }),
  };
};

const parseGeminiResponse = (result) => {
  // 嘗試多種路徑找到文字內容
  let responseText = "";

  // 路徑 1: 直接 .text（@google/genai v1.x 的標準回傳）
  try {
    if (typeof result?.text === "string" && result.text) {
      responseText = result.text;
    } else if (typeof result?.text === "function") {
      responseText = result.text();
    }
  } catch {
    // text 可能是 getter 並拋出錯誤
  }

  // 路徑 2: result.response.text() (舊版或特定回傳)
  if (!responseText) {
    try {
      if (result?.response && typeof result.response.text === "function") {
        responseText = result.response.text();
      } else if (typeof result?.response?.text === "string") {
        responseText = result.response.text;
      }
    } catch {
      // ignore
    }
  }

  // 路徑 3: 從 candidates 中提取
  if (!responseText) {
    const candidates = result?.candidates || result?.response?.candidates;
    if (candidates?.[0]?.content?.parts) {
      const parts = candidates[0].content.parts;
      if (parts.length > 0) {
        responseText = parts.map((part) => part.text).filter(Boolean).join("\n");
      }
    }
  }

  if (!responseText) {
    throw new Error("Empty response from AI (無法從回應中提取文字)");
  }

  // JSON 解析處理
  let cleanText = responseText.trim();
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  return JSON.parse(cleanText);
};

/**
 * Runs one JSON-returning Gemini request with the tenant-configured model.
 * Retries and peer-model failover live in api/_shared/llmRuntime.js.
 *
 * @param {object} params
 * @param {{ modelName: string, apiKey: string }} params.model
 * @param {string} [params.systemMessage]
 * @param {string} params.userMessage
 * @param {{ mimeType: string, base64: string }} [params.attachment]
 * @param {number} [params.maxOutputTokens]
 */
const postGeminiJson = async ({
  model,
  systemMessage,
  userMessage,
  attachment,
  maxOutputTokens,
}) => {
  const parts = [
    { text: [systemMessage, userMessage].filter(Boolean).join("\n\n") },
  ];
  if (attachment) {
    parts.push({
      inlineData: { mimeType: attachment.mimeType, data: attachment.base64 },
    });
  }

  const result = await getModel(model.modelName, model.apiKey).generateContent(
    [{ role: "user", parts }],
    {
      responseMimeType: "application/json",
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    }
  );

  const candidate = result?.candidates?.[0] || result?.response?.candidates?.[0];
  if (candidate?.finishReason === "MAX_TOKENS") {
    const error = new Error(
      `分析模型未在輸出上限 ${maxOutputTokens || "預設值"} 內完成回應（MAX_TOKENS）`
    );
    error.code = OUTPUT_TRUNCATED;
    throw error;
  }

  return parseGeminiResponse(result);
};

/**
 * Streams one Gemini call with function declarations. Text parts go to
 * `onTextDelta`; function calls are returned once the stream ends normally.
 */
const streamGeminiResponse = async ({
  model,
  systemMessage,
  messages,
  tools,
  maxOutputTokens,
  signal,
  onTextDelta,
}) => {
  const stream = await getClient(model.apiKey).models.generateContentStream({
    model: model.modelName,
    contents: messages.map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: content }],
    })),
    config: {
      systemInstruction: systemMessage,
      tools: [{
        functionDeclarations: tools.map(({ name, description, parameters }) => ({
          name,
          description,
          parametersJsonSchema: parameters,
        })),
      }],
      abortSignal: signal,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    },
  });

  let text = "";
  const toolCalls = [];
  let finishReason = null;
  for await (const chunk of stream) {
    const candidate = chunk?.candidates?.[0];
    for (const part of candidate?.content?.parts || []) {
      if (part.thought) continue;
      if (part.functionCall) {
        const args = part.functionCall.args ?? {};
        if (typeof args !== "object" || Array.isArray(args)) {
          const error = new Error(`對話模型的 ${part.functionCall.name} 工具參數無效`);
          error.code = INVALID_TOOL_CALL;
          throw error;
        }
        toolCalls.push({ name: part.functionCall.name, arguments: args });
      } else if (part.text) {
        text += part.text;
        onTextDelta(part.text);
      }
    }
    if (candidate?.finishReason) finishReason = candidate.finishReason;
  }

  if (finishReason === "MAX_TOKENS") {
    const error = new Error("對話模型未在輸出上限內完成回應（MAX_TOKENS）");
    error.code = OUTPUT_TRUNCATED;
    throw error;
  }
  if (finishReason !== "STOP") {
    const error = new Error(`對話模型未正常完成回應（${finishReason || "stream_ended"}）`);
    error.status = 502;
    throw error;
  }

  return { text, toolCalls };
};

module.exports = {
  getModel,
  postGeminiJson,
  parseGeminiResponse,
  streamGeminiResponse,
};

