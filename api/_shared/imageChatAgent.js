/**
 * Image-chat agent contract.
 *
 * Owns what the chat model is told, which earlier messages it sees, and how
 * its tool calls become one validated decision. It never builds the final
 * image prompt, queues work, or writes memory; the handler does that with the
 * shared prompt, job, and memory helpers.
 */

const { IMAGE_PURPOSES } = require("./imagePrompt");
const { describeCanvas, describeImagePurpose } = require("./imagePromptStrategy");

const MAX_USER_MESSAGE_CHARS = 4000;
const MAX_TOOL_TEXT_CHARS = 4000;
const CONTEXT_MESSAGE_LIMIT = 24;
const CONTEXT_CHAR_BUDGET = 16000;
const MAX_OUTPUT_TOKENS = 6000;
const MAX_IMAGES_PER_TURN = 4;
const MAX_MEMORY_NOTES_PER_TURN = 3;
const MAX_MEMORY_NOTE_CHARS = 200;
const MAX_WEB_SEARCHES_PER_TURN = 2;

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
    `Create one brand-new image. Call only when the request has enough detail to draw. Call once per distinct image when the user asks for several (at most ${MAX_IMAGES_PER_TURN} images per turn). Do not call it to ask questions.`,
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
        description: "infographic or freeform image. Omit to keep the current setting.",
      },
    },
    required: ["prompt"],
  },
});

const REFINE_TOOL = Object.freeze({
  name: "refine_image",
  description:
    "Edit the currently selected image version. Call when the user asks to change something in that image while keeping the rest. Call once per variant when the user wants several different edits of it.",
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

const REMEMBER_TOOL = Object.freeze({
  name: "remember_preference",
  description:
    "Save one lasting user preference or rule to the user's memory. Call when the user asks you to remember something or states a rule for all future images (for example 'always', 'from now on', 'never'). Do not call it for one-off requests.",
  parameters: {
    type: "object",
    properties: {
      note: {
        type: "string",
        description: `One short, self-contained sentence in Traditional Chinese, at most ${MAX_MEMORY_NOTE_CHARS} characters.`,
      },
    },
    required: ["note"],
  },
});

const describeSettings = ({ settings, style, hasAttachment, hasSelectedImage, hasMask }) => [
  `- 畫面用途：${describeImagePurpose(settings.purpose)}`,
  `- 畫布：${describeCanvas(settings.aspectRatio)}`,
  `- 套用風格：${style?.name || (style?.prompt ? "自訂風格" : "未指定")}`,
  `- 附圖：${hasAttachment ? "使用者附上一張參考圖，生成新圖時會作為內容參考" : "無"}`,
  `- 目前選取的圖片版本：${hasSelectedImage ? "有，可以修改" : "無"}`,
  ...(hasMask ? ["- 精確編輯：使用者已在目前圖片上圈選要修改的區域，這一輪只能用 refine_image 修改圈選區域"] : []),
].join("\n");

const buildSystemMessage = (turn) => `你是 Pixora 的對話式生圖助理，使用繁體中文（台灣用語）簡潔回覆。

每一輪你可以做下列事情：
1. 一般回覆或追問：資訊不足、意圖不明或使用者只是在討論時，用一兩句話回覆或提出最關鍵的一個問題，不呼叫工具。
2. generate_image：資訊足以畫出新圖時呼叫。使用者要求多張不同的圖（例如「四季各一張」「封面和內頁」）時，每張圖各呼叫一次，每次的描述都要完整自足；同一輪最多 ${MAX_IMAGES_PER_TURN} 張。同一張圖的細節調整不要拆成多張。
3. refine_image：使用者要求修改目前選取的圖片時呼叫；要求多種不同修改時可各呼叫一次。${turn.hasSelectedImage ? "" : "目前沒有選取的圖片，不能使用。"}
4. remember_preference：使用者要你記住某件事，或說出之後都要遵守的規定時呼叫，每個偏好一次（同一輪最多 ${MAX_MEMORY_NOTES_PER_TURN} 次）。一次性的要求不要記錄。
5. web_search：畫面內容需要你不確定或可能已過時的真實資訊時，先搜尋網路再回覆或生圖；同一輪最多 ${MAX_WEB_SEARCHES_PER_TURN} 次。

何時搜尋網路：
- 要搜尋：近期事件、節慶、賽事或展覽；品牌、產品、包裝、標誌或店家；真實地點、建築或地標；特定人物、角色、作品、在地用語或流行語；要畫進圖裡的數據、日期、規格或價格。
- 不要搜尋：純創意或虛構的畫面；修改目前圖片或調整風格、構圖、顏色；使用者已經提供的資訊；常識、閒聊或你要追問使用者的時候。
- 不要為了取得真實人物的長相而搜尋。
- 生圖模型看不到搜尋結果，必須把查到的關鍵事實（外觀、顏色、文字、數據）寫進 generate_image 的描述。
- 暱稱、迷因、網路用語或角色別名：第一次搜尋不明確時，換個寫法再搜一次（例如加上「梗」「迷因」「角色」「出處」，或改用簡體、英文）。
- 搜尋結果中有一個明顯最知名的對象（例如熱門角色或迷因），就直接採用並在回覆中用一句話說明你理解的是誰；只有多個對象同樣可能時才追問。
- 查不到可靠資料時，直接告訴使用者並詢問細節，不要自行編造。
- 回覆中不要放網址、連結或引用標記，來源會另外顯示給使用者。

規則：
- 呼叫工具時先用一句話說明你要做什麼，不要描述你看不到的圖片內容。
- 工具參數要完整自足，合併對話中仍有效的要求；不要寫入風格、比例或圖中文字語言設定，系統會自動套用。
- 使用者記憶中的偏好與規定一律遵守，並寫進生圖或修改的工具參數；若與使用者本輪明確要求衝突，以本輪要求為準。
- 不要宣稱圖片已完成；圖片會在背景處理。

使用者記憶：
${turn.memory?.trim() || "（目前沒有）"}

目前設定：
${describeSettings(turn)}`;

const describeAssistantMessage = (message) => {
  const parts = [message.content.trim()];
  for (const image of message.images || []) {
    parts.push(`[已送出${image.action === "refine" ? "修改圖片" : "生成新圖"}：${image.prompt}]`);
  }
  for (const search of message.input?.searches || []) {
    if (search.status === "completed" && search.query) parts.push(`[已搜尋網路：${search.query}]`);
  }
  for (const note of message.input?.memoryNotes || []) parts.push(`[已記住：${note}]`);
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

const toolsFor = (turn) => turn.hasMask ? [REFINE_TOOL] : [
  GENERATE_TOOL,
  ...(turn.hasSelectedImage ? [REFINE_TOOL] : []),
  REMEMBER_TOOL,
];

const requireToolText = (value, label) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new ImageChatDecisionError(`對話模型的${label}是空的，未建立圖片工作`);
  if (text.length > MAX_TOOL_TEXT_CHARS) {
    throw new ImageChatDecisionError(`對話模型的${label}過長，未建立圖片工作`);
  }
  return text;
};

const resolveMemoryNote = (value) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().replace(/^[-*]\s*/, "") : "";
  if (!text || text.length > MAX_MEMORY_NOTE_CHARS) {
    throw new ImageChatDecisionError("對話模型要記住的偏好無效，未建立圖片工作");
  }
  return text;
};

const resolveImageCall = (call, turn) => {
  if (call.name === GENERATE_TOOL.name && !turn.hasMask) {
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

/**
 * Turns the completed reply's tool calls into one decision:
 * `{ images: [{ action: "generate", prompt, purpose } | { action: "refine", prompt }], notes: string[] }`.
 * Both lists are empty for a plain reply. Anything invalid fails the whole
 * turn without queuing work.
 */
const resolveDecision = (toolCalls, turn) => {
  const images = [];
  const notes = [];
  for (const call of toolCalls) {
    if (call.name === REMEMBER_TOOL.name && !turn.hasMask) {
      notes.push(resolveMemoryNote(call.arguments.note));
    } else {
      images.push(resolveImageCall(call, turn));
    }
  }
  if (images.length > MAX_IMAGES_PER_TURN) {
    throw new ImageChatDecisionError(`對話模型一次要求超過 ${MAX_IMAGES_PER_TURN} 張圖片，未建立圖片工作`);
  }
  if (notes.length > MAX_MEMORY_NOTES_PER_TURN) {
    throw new ImageChatDecisionError("對話模型一次要記住過多偏好，未建立圖片工作");
  }
  return { images, notes };
};

module.exports = {
  CONTEXT_CHAR_BUDGET,
  CONTEXT_MESSAGE_LIMIT,
  GENERATE_TOOL,
  ImageChatDecisionError,
  MAX_IMAGES_PER_TURN,
  MAX_OUTPUT_TOKENS,
  MAX_USER_MESSAGE_CHARS,
  MAX_WEB_SEARCHES_PER_TURN,
  REFINE_TOOL,
  REMEMBER_TOOL,
  buildModelMessages,
  buildSystemMessage,
  resolveDecision,
  toolsFor,
};
