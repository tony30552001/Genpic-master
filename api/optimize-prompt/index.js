const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const {
    LlmConfigurationError,
    resolveRoleModel,
} = require("../_shared/llmModels");
const { generateJson } = require("../_shared/llmRuntime");
const { rateLimit } = require("../_shared/rateLimit");
const { buildImageTextDirective } = require("../_shared/imageTextLanguage");
const {
    TemplateContextError,
    buildTemplateInstruction,
    normalizeTemplateContext,
} = require("../_shared/templateContext");

const OPTIMIZE_PROMPT_SYSTEM_MESSAGE = `
擔任專業的 AI 圖像生成提示詞工程師 (Prompt Engineer)。
你的任務是接收使用者的簡短描述 (User Script) 與風格參考 (Style Context)，
並輸出一段給使用者閱讀的「繁體中文描述」與一段實際送給圖像模型的「英文生成提示詞 (Prompt)」。

目標模型是指令跟隨型圖像模型（Gemini 圖像模型與 GPT Image），它們理解完整敘述，不理解關鍵字堆疊。

英文 Prompt 的要求：
1. 寫成一段連貫的英文敘述，像在向專業美術指導說明畫面。
   嚴禁輸出逗號分隔的關鍵字清單（例如 "8k, masterpiece, cinematic lighting, highly detailed"）。
2. 依序涵蓋五個要素：風格 (Style)、主體 (Subject)、場景 (Setting)、動作或狀態 (Action)、構圖與鏡頭 (Composition)。
3. 補充光影、材質、色彩與氛圍，讓畫面能被明確重現；但不得偏離使用者描述的核心主體與動作。
4. 若有提供 Style Context，整段敘述都必須符合該風格。
5. 需要出現在圖片中的文字，一律用雙引號包住並保留原文、不得翻譯，
   並說明其位置與排版（例如 the title "營收成長" centered at the top）。
6. 使用中性、安全的措辭，避免暴力、血腥、露骨或指涉真實人物身分的字眼，以免被模型的安全過濾器攔截。
7. 長度約 80-160 個英文單字。
8. 若提供輸出結構規則，必須遵守其模組數、資訊流與避免事項；不得用額外內容取代使用者主題。

繁體中文描述的要求：
- 通順的一段話（約 50-100 字），讓使用者一眼看懂畫面被擴充了什麼。
- 不要出現英文提示詞語法或關鍵字清單。

請回傳一個 JSON 物件，格式嚴格如下：
{
  "optimizedPromptZh": "這裡填寫優化後給使用者看的繁體中文描述，必須是通順的段落（約50-100字）...",
  "optimizedPromptEn": "這裡填寫優化後實際送給 AI 生圖的英文 Prompt，必須是完整句子構成的敘述段落...",
  "explanation": "這裡用繁體中文簡短說明你增加了哪些細節（例如：加入了電影光效與廣角鏡頭）..."
}
`;

module.exports = async function (context, req) {
    context.log("[optimize-prompt] Function invoked");

    try {
        // 1. Handle OPTIONS for CORS
        if ((req.method || "").toUpperCase() === "OPTIONS") {
            context.res = options();
            return;
        }

        // 2. Auth Check
        const auth = await requireAuth(context, req);
        if (!auth) return;

        // 3. Rate Limit
        const limited = rateLimit(req, auth.user);
        if (limited.limited) {
            context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429);
            return;
        }

        // 4. Get Input
        const { userScript, styleContext, imageLanguage, templateContext } = req.body || {};
        if (!userScript) {
            context.res = error("請提供需要優化的描述 (userScript)", "bad_request", 400);
            return;
        }

        let normalizedTemplateContext = null;
        try {
            normalizedTemplateContext = normalizeTemplateContext(templateContext);
        } catch (err) {
            if (err instanceof TemplateContextError) {
                context.res = error(err.message, err.code, err.status);
                return;
            }
            throw err;
        }

        const imageTextDirective = buildImageTextDirective(imageLanguage);
        const templateInstruction = buildTemplateInstruction(normalizedTemplateContext);
        const promptText = [
            `User Script: "${userScript}"`,
            `Style Context: "${styleContext || "無特定風格 (General)"}"`,
            templateInstruction ? `Output Structure Rules: "${templateInstruction}"` : "",
            imageTextDirective ? `圖片文字要求：${imageTextDirective}` : "",
            "",
            "請優化上述描述：",
        ]
            .filter(Boolean)
            .join("\n");

        // 5. Call the analysis model assigned to this role in the admin center.
        const identity = await resolveIdentity(auth.user);
        const llm = await resolveRoleModel(identity.tenantId, "prompt_optimization");
        const data = await generateJson({
            llm,
            systemMessage: OPTIMIZE_PROMPT_SYSTEM_MESSAGE,
            userMessage: promptText,
        });

        if (
            !data ||
            typeof data.optimizedPromptZh !== "string" ||
            typeof data.optimizedPromptEn !== "string" ||
            typeof data.explanation !== "string"
        ) {
            throw new Error("Azure OpenAI 回傳缺少必要的優化欄位");
        }

        context.res = ok(data);

    } catch (err) {
        context.log.error("[optimize-prompt] Error:", err.message);
        if (err instanceof LlmConfigurationError) {
            context.res = error(err.message, err.code, err.status);
            return;
        }
        context.res = error("優化失敗: " + err.message, "internal_error", 500);
    }
};
