const DEFAULT_DEPLOYMENT = "gpt-5.6-luna";

// Deck authoring emits strict, structurally validated SVG and runs inside the
// background worker, so it trades latency for a deeper reasoning deployment.
const DEFAULT_DECK_DEPLOYMENT = "gpt-5.6-sol";

const getConfiguredEndpoint = () =>
  process.env.AZURE_OPENAI_ENDPOINT ||
  process.env.AZURE_OPENAI_BASE_URL ||
  deriveEndpointFromImageSetting();

const deriveEndpointFromImageSetting = () => {
  const imageEndpoint = process.env.GPT_IMAGE_ENDPOINT;
  if (!imageEndpoint) return "";

  try {
    const url = new URL(imageEndpoint);
    url.pathname = url.pathname.replace(/\/images\/(edits|generations).*$/i, "");
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return imageEndpoint.replace(/\/images\/(edits|generations).*$/i, "");
  }
};

const getApiKey = () =>
  process.env.AZURE_OPENAI_API_KEY || process.env.GPT_IMAGE_API_KEY || "";

const getDeployment = () =>
  process.env.AZURE_OPENAI_DEPLOYMENT || DEFAULT_DEPLOYMENT;

const getDeckDeployment = () =>
  process.env.AZURE_OPENAI_DECK_DEPLOYMENT || DEFAULT_DECK_DEPLOYMENT;

const getResponsesEndpoint = () => {
  const configuredEndpoint = getConfiguredEndpoint();
  if (!configuredEndpoint) {
    throw new Error(
      "AZURE_OPENAI_ENDPOINT 尚未設定（也未找到可共用的 GPT_IMAGE_ENDPOINT）"
    );
  }

  let url;
  try {
    url = new URL(configuredEndpoint);
  } catch {
    throw new Error("AZURE_OPENAI_ENDPOINT 格式無效");
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

const generateJsonCompletion = async ({
  systemMessage,
  userMessage,
  imageDataUrl,
  fileDataUrl,
  fileName,
  maxOutputTokens,
  deployment,
}) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "AZURE_OPENAI_API_KEY 尚未設定（也未找到可共用的 GPT_IMAGE_API_KEY）"
    );
  }

  const response = await fetch(getResponsesEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      model: deployment || getDeployment(),
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
    throw new Error(`${message} (${response.status})`);
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
  generateJsonCompletion,
  parseJsonContent,
  getResponsesEndpoint,
  getDeployment,
  getDeckDeployment,
};
