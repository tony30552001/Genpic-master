/**
 * Shared analysis-model contract: the role catalog and the error codes the
 * Azure OpenAI client raises. Every analysis model is an Azure OpenAI
 * deployment called through the Responses API.
 */

/**
 * Reasoning models can spend the whole output budget on reasoning and answer
 * with no content. api/_shared/llmRuntime.js retries those with a larger
 * budget instead of a smaller one.
 */
const OUTPUT_TRUNCATED = "output_truncated";

/** A streamed tool call whose arguments are not a JSON object; never acted on. */
const INVALID_TOOL_CALL = "invalid_tool_call";

const LLM_ROLES = Object.freeze([
  {
    id: "prompt_optimization",
    label: "Prompt 優化",
    description: "把使用者輸入改寫為中英文生成 Prompt",
  },
  {
    id: "deck_authoring",
    label: "設計簡報",
    description: "PPT Master 的大綱與每頁 SVG 版面",
  },
  {
    id: "style_analysis",
    label: "風格分析",
    description: "從參考圖萃取風格描述與標籤",
  },
  {
    id: "filename",
    label: "檔名生成",
    description: "依生成內容命名輸出檔案",
  },
  {
    id: "image_chat",
    label: "對話創作",
    description: "串流回覆對話、搜尋網路，並決定追問、生成新圖或修改目前版本；需支援工具呼叫與網路搜尋",
  },
]);

const getRole = (roleId) =>
  LLM_ROLES.find((role) => role.id === String(roleId || "").trim()) || null;

module.exports = {
  INVALID_TOOL_CALL,
  LLM_ROLES,
  OUTPUT_TRUNCATED,
  getRole,
};
