const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { generateJson } = require("../_shared/llmRuntime");
const { resolveIdentity } = require("../_shared/identity");
const {
    LlmConfigurationError,
    resolveRoleModel,
} = require("../_shared/llmModels");
const { rateLimit } = require("../_shared/rateLimit");
const { buildImageTextDirective } = require("../_shared/imageTextLanguage");

const OPTIMIZE_SCENE_PROMPT = `你是專業的視覺導演與 AI 圖像生成提示詞工程師。
你將收到一個「場景」資料（包含標題、描述、英文 Prompt），請進行以下優化：

1. **scene_title**（繁體中文）：精煉場景標題，使其更具畫面感與戲劇性，控制在 15 字以內。
2. **scene_description**（繁體中文）：提升場景描述的文學質感和視覺細節，保留原意但讓描述更生動具體，可適度加入動作、表情、光影氛圍等細節。控制在 100-200 字。
3. **visual_prompt**（英文）：大幅優化 AI 圖像生成 Prompt，加入更多專業的構圖指示、光影描述、風格參考、鏡頭角度等。需要 200-400 字的高品質英文 Prompt。

回傳 JSON 物件：
{
  "scene_title": "優化後的繁體中文標題",
  "scene_description": "優化後的繁體中文描述",
  "visual_prompt": "Optimized English prompt with rich visual details...",
  "optimization_notes": "繁體中文，簡短說明此次優化的重點（1-2 句話）"
}

重要：
- 保留原始場景的核心語意，不要偏離主題
- 繁體中文的表達要自然流暢，像是專業編輯撰寫的
- 目標模型是指令跟隨型圖像模型，visual_prompt 必須寫成完整句子構成的敘述段落，
  嚴禁輸出逗號分隔的關鍵字清單（例如 "8k, masterpiece, cinematic lighting"）
- visual_prompt 需依序涵蓋風格 (Style)、主體 (Subject)、場景 (Setting)、動作 (Action)、構圖與鏡頭 (Composition)
- 需要出現在圖片中的文字，一律用雙引號包住並保留原文、不得翻譯，並說明其位置與排版
- 英文 Prompt 應避免敏感或暴力內容
- 確保描述中不包含任何會被 AI 安全過濾器攔截的字眼`;

module.exports = async function (context, req) {
    context.log("[optimize-scene] Function invoked");

    try {
        if ((req.method || "").toUpperCase() === "OPTIONS") {
            context.res = options();
            return;
        }

        // Auth
        const auth = await requireAuth(context, req);
        if (!auth) return;

        // Rate Limit
        const limited = rateLimit(req, auth.user);
        if (limited.limited) {
            context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429);
            return;
        }

        // Get Input
        const { scene_title, scene_description, visual_prompt, mood, key_elements, styleContext, imageLanguage } = req.body || {};

        if (!scene_title && !scene_description && !visual_prompt) {
            context.res = error("請提供場景資料", "bad_request", 400);
            return;
        }

        // Build prompt with the Gemini model assigned in the admin center.
        const identity = await resolveIdentity(auth.user);
        const llm = await resolveRoleModel(identity.tenantId, "scene_optimization");

        let inputText = `請優化以下場景：

場景標題：${scene_title || "（無）"}
場景描述：${scene_description || "（無）"}
英文 Prompt：${visual_prompt || "（無）"}
氛圍：${mood || "（無）"}
關鍵元素：${(key_elements || []).join("、") || "（無）"}`;

        if (styleContext) {
            inputText += `\n\n參考風格：${styleContext}`;
        }

        const imageTextDirective = buildImageTextDirective(imageLanguage);
        if (imageTextDirective) {
            inputText += `\n\n圖片文字要求：${imageTextDirective}`;
        }

        // Parse
        let data;
        try {
            data = await generateJson({
                llm,
                systemMessage: OPTIMIZE_SCENE_PROMPT,
                userMessage: inputText,
            });
        } catch (e) {
            context.log.error("[optimize-scene] Parse failed:", e.message);
            data = {
                scene_title: scene_title,
                scene_description: scene_description,
                visual_prompt: visual_prompt,
                optimization_notes: "優化回應解析失敗，已保留原始內容。",
            };
        }

        context.log("[optimize-scene] Success, optimized title:", data.scene_title?.substring(0, 30));
        context.res = ok(data);

    } catch (err) {
        context.log.error("[optimize-scene] Error:", err.message);
        if (err instanceof LlmConfigurationError) {
            context.res = error(err.message, err.code, err.status);
            return;
        }
        context.res = error("場景優化失敗: " + err.message, "internal_error", 500);
    }
};
