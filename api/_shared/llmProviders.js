/**
 * Shared analysis-model contract: the provider catalog, the role catalog and
 * the error code both provider clients raise when a model stops before it
 * produces content.
 */

const PROVIDERS = Object.freeze({
  AZURE_OPENAI: "azure-openai",
  GOOGLE_GEMINI: "google-gemini",
});

/**
 * Reasoning models can spend the whole output budget on reasoning and answer
 * with no content. api/_shared/llmRuntime.js retries those with a larger
 * budget instead of a smaller one.
 */
const OUTPUT_TRUNCATED = "output_truncated";

const LLM_PROVIDERS = Object.freeze([
  {
    id: PROVIDERS.AZURE_OPENAI,
    label: "Azure OpenAI",
    requiresEndpoint: true,
    endpointHint: "https://<resource>.openai.azure.com",
  },
  {
    id: PROVIDERS.GOOGLE_GEMINI,
    label: "Google Gemini",
    requiresEndpoint: false,
    endpointHint: "",
  },
]);

/** Every role accepts any provider; api/_shared/llmRuntime.js dispatches per model. */
const LLM_ROLES = Object.freeze([
  {
    id: "document_analysis",
    label: "文件分析",
    description: "上傳文件後拆解場景與重點",
  },
  {
    id: "prompt_optimization",
    label: "Prompt 優化",
    description: "把使用者輸入改寫為中英文生成 Prompt",
  },
  {
    id: "deck_authoring",
    label: "簡報生成",
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
    id: "scene_optimization",
    label: "場景優化",
    description: "改寫單一場景的描述與視覺 Prompt",
  },
]);

const getRole = (roleId) =>
  LLM_ROLES.find((role) => role.id === String(roleId || "").trim()) || null;

const getProvider = (providerId) =>
  LLM_PROVIDERS.find((provider) => provider.id === String(providerId || "").trim()) ||
  null;

module.exports = {
  LLM_PROVIDERS,
  LLM_ROLES,
  OUTPUT_TRUNCATED,
  PROVIDERS,
  getProvider,
  getRole,
};
