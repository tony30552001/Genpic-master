const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel, parseGeminiResponse } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");

const OPTIMIZE_PROMPT_SYSTEM_MESSAGE = `
擔任專業的 AI 圖像生成提示詞工程師 (Prompt Engineer)。
你的任務是接收使用者的簡短描述 (User Script) 與風格參考 (Style)，並將其優化為高品質的「繁體中文描述」與「英文生成提示詞 (Prompt)」。

優化原則：
1. 保持原意：保留使用者描述的核心主體與動作。
2. 增加細節：補充光影 (Lighting)、構圖 (Composition)、材質 (Texture)、氛圍 (Mood) 等視覺細節。
3. 風格一致：若有提供風格描述，請確保雙語描述都符合該風格。
4. 英文輸出極重要：生成的 Prompt 必須是詳細的英文關鍵字組合，因為大多數生圖模型對英文理解最佳。
5. 中文輸出要流暢：給使用者看的中文版必須是通順的一段話，讓使用者輕易理解擴充了哪些內容。

請回傳一個 JSON 物件，格式嚴格如下：
{
  "optimizedPromptZh": "這裡填寫優化後給使用者看的繁體中文描述，必須是通順的段落（約50-100字）...",
  "optimizedPromptEn": "這裡填寫優化後實際送給 AI 生圖的英文 Prompt，包含豐富的視覺關鍵字，建議用逗號分隔...",
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
        const { userScript, styleContext } = req.body || {};
        if (!userScript) {
            context.res = error("請提供需要優化的描述 (userScript)", "bad_request", 400);
            return;
        }

        // 5. Call Gemini
        const modelName = process.env.GEMINI_MODEL_ANALYSIS || "gemini-1.5-flash"; // Use faster model for interactive tasks
        const model = getModel(modelName);

        const promptText = `
User Script: "${userScript}"
Style Context: "${styleContext || '無特定風格 (General)'}"

請優化上述描述：
`;

        const result = await model.generateContent([
            {
                role: "user",
                parts: [{ text: OPTIMIZE_PROMPT_SYSTEM_MESSAGE + "\n" + promptText }]
            }
        ], {
            responseMimeType: "application/json"
        });

        // 6. Parse Result using shared utility
        let data;
        try {
            data = parseGeminiResponse(result);
            // Fallback for older model formats if it only returns optimizedPrompt
            if (data && data.optimizedPrompt && (!data.optimizedPromptZh && !data.optimizedPromptEn)) {
                data.optimizedPromptZh = data.optimizedPrompt;
                data.optimizedPromptEn = data.optimizedPrompt;
            }
        } catch (e) {
            context.log.error("Failed to parse Gemini response:", e);
            data = {
                optimizedPromptZh: userScript,
                optimizedPromptEn: userScript,
                explanation: "優化回應解析失敗，請稍後重試。"
            };
        }

        context.res = ok(data);

    } catch (err) {
        context.log.error("[optimize-prompt] Error:", err.message);
        context.res = error("優化失敗: " + err.message, "internal_error", 500);
    }
};
