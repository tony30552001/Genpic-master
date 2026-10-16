/**
 * Image-chat agent contract.
 *
 * Owns what the chat model is told, which earlier messages it sees, and how
 * its tool call becomes one validated decision. It never builds the final
 * image prompt or queues work; the handler does that with the shared prompt
 * and job helpers.
 */

const { IMAGE_PURPOSES } = require("./imagePrompt");
const { describeCanvas, describeImagePurpose } = require("./imagePromptStrategy");

const MAX_USER_MESSAGE_CHARS = 4000;
const MAX_TOOL_TEXT_CHARS = 4000;
const CONTEXT_MESSAGE_LIMIT = 24;
const CONTEXT_CHAR_BUDGET = 16000;
const MAX_OUTPUT_TOKENS = 4000;

class ImageChatDecisionError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImageChatDecisionError";
    this.code = "invalid_action";
  }
}

const GENERATE_TOOL = Object.freeze({
  name: "generate_image",
  description:
    "Create a brand-new image. Call only when the request has enough detail to draw. Do not call it to ask questions.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Self-contained description of the image content: subject, scene, composition, and any exact on-image text. Merge every requirement still in force from the conversation. Do not restate the style, aspect ratio, or text-language settings; they are applied automatically.",
      },
      purpose: {
        type: "string",
        enum: [...IMAGE_PURPOSES],
        description: "infographic, storyboard frame, or freeform image. Omit to keep the current setting.",
      },
    },
    required: ["prompt"],
  },
});

const REFINE_TOOL = Object.freeze({
  name: "refine_image",
  description:
    "Edit the currently selected image version. Call when the user asks to change something in that image while keeping the rest.",
  parameters: {
    type: "object",
    properties: {
      instruction: {
        type: "string",
        description: "Exactly what to change in the selected image, stated as an edit instruction.",
      },
    },
    required: ["instruction"],
  },
});

const describeSettings = ({ settings, style, hasAttachment, hasSelectedImage }) => [
  `- 畫面用途：${describeImagePurpose(settings.purpose)}`,
  `- 畫布：${describeCanvas(settings.aspectRatio)}`,
  `- 套用風格：${style?.name || (style?.prompt ? "自訂風格" : "未指定")}`,
  `- 附圖：${hasAttachment ? "使用者附上一張參考圖，生成新圖時會作為內容參考" : "無"}`,
  `- 目前選取的圖片版本：${hasSelectedImage ? "有，可以修改" : "無"}`,
].join("\n");

const buildSystemMessage = (turn) => `你是 Pixora 的對話式生圖助理，使用繁體中文（台灣用語）簡潔回覆。

每一輪你只能做一件事：
1. 一般回覆或追問：資訊不足、意圖不明或使用者只是在討論時，用一兩句話回覆或提出最關鍵的一個問題，不呼叫工具。
2. generate_image：資訊足以畫出一張新圖時呼叫，最多呼叫一次。
3. refine_image：使用者要求修改目前選取的圖片時呼叫，最多呼叫一次。${turn.hasSelectedImage ? "" : "目前沒有選取的圖片，不能使用。"}

規則：
- 呼叫工具時先用一句話說明你要做什麼，不要描述你看不到的圖片內容。
- 工具參數要完整自足，合併對話中仍有效的要求；不要寫入風格、比例或圖中文字語言設定，系統會自動套用。
- 不要宣稱圖片已完成；圖片會在背景處理。
- 不要在同一輪呼叫多個工具。

目前設定：
${describeSettings(turn)}`;

const describeAssistantMessage = (message) => {
  const parts = [message.content.trim()];
  const toolText = message.input?.prompt;
  if (message.action === "generate" && toolText) parts.push(`[已送出生成新圖：${toolText}]`);
  if (message.action === "refine" && toolText) parts.push(`[已送出修改圖片：${toolText}]`);
  if (message.status === "failed" || message.status === "interrupted") parts.push("[這次回覆未完成]");
  return parts.filter(Boolean).join("\n");
};

/**
 * Picks the newest earlier messages that fit the budget, oldest first, then
 * the current user message. The current message is capped at intake, so the
 * request always fits.
 *
 * @param {object[]} history Earlier messages, oldest first.
 * @param {string} content The current user message.
 */
const buildModelMessages = (history, content) => {
  const selected = [];
  let used = content.length;
  for (const message of history.slice(-CONTEXT_MESSAGE_LIMIT).reverse()) {
    const text = message.role === "assistant"
      ? describeAssistantMessage(message)
      : message.content.trim();
    if (!text) continue;
    if (used + text.length > CONTEXT_CHAR_BUDGET) break;
    used += text.length;
    selected.unshift({ role: message.role, content: text });
  }
  // Providers require turns to start with the user.
  while (selected[0]?.role === "assistant") selected.shift();
  return [...selected, { role: "user", content }];
};

const toolsFor = (turn) => (turn.hasSelectedImage ? [GENERATE_TOOL, REFINE_TOOL] : [GENERATE_TOOL]);

const requireToolText = (value, label) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ImageChatDecisionError(`對話模型的${label}是空的，未建立圖片工作`);
  if (text.length > MAX_TOOL_TEXT_CHARS) {
    throw new ImageChatDecisionError(`對話模型的${label}過長，未建立圖片工作`);
  }
  return text;
};

/**
 * Turns the completed reply's tool calls into one decision:
 * `{ action: "none" }`, `{ action: "generate", prompt, purpose }`, or
 * `{ action: "refine", prompt }`. Anything else fails without queuing work.
 */
const resolveDecision = (toolCalls, turn) => {
  if (toolCalls.length === 0) return { action: "none" };
  if (toolCalls.length > 1) {
    throw new ImageChatDecisionError("對話模型同時要求多個動作，未建立圖片工作");
  }
  const [call] = toolCalls;
  if (call.name === GENERATE_TOOL.name) {
    const purpose = call.arguments.purpose;
    if (purpose !== undefined && !IMAGE_PURPOSES.includes(purpose)) {
      throw new ImageChatDecisionError("對話模型指定的畫面用途無效，未建立圖片工作");
    }
    return {
      action: "generate",
      prompt: requireToolText(call.arguments.prompt, "生圖描述"),
      purpose: purpose || turn.settings.purpose,
    };
  }
  if (call.name === REFINE_TOOL.name && turn.hasSelectedImage) {
    return { action: "refine", prompt: requireToolText(call.arguments.instruction, "修改指示") };
  }
  throw new ImageChatDecisionError("對話模型要求了不支援的動作，未建立圖片工作");
};

module.exports = {
  CONTEXT_CHAR_BUDGET,
  CONTEXT_MESSAGE_LIMIT,
  GENERATE_TOOL,
  ImageChatDecisionError,
  MAX_OUTPUT_TOKENS,
  MAX_USER_MESSAGE_CHARS,
  REFINE_TOOL,
  buildModelMessages,
  buildSystemMessage,
  resolveDecision,
  toolsFor,
};
