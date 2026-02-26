const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel, parseGeminiResponse } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");

const GENERATE_FILENAME_SYSTEM_MESSAGE = `
你是一個負責為圖片自動命名的助手。
請閱讀使用者針對圖片所下的提示詞 (Prompt)，並濃縮成一個簡潔、有描述性的英文檔名。
規則：
1. 長度限制在 3 到 6 個英文單字。
2. 使用 kebab-case 格式（例如：cyberpunk-neon-city, cute-cat-playing-piano）。
3. 只能包含英文小寫字母、數字與破折號（-）。
4. 不要包含副檔名（如 .png 或 .jpg）。
5. 直接且強烈地表達圖片的核心主體與氛圍。

請回傳一個 JSON 物件，格式嚴格如下：
{
  "filename": "你的-檔名-結果"
}
`;

module.exports = async function (context, req) {
    context.log("[generate-filename] Function invoked");

    try {
        // 1. Handle OPTIONS for CORS
        if ((req.method || "").toUpperCase() === "OPTIONS") {
            context.res = options();
            return;
        }

        // 2. Auth Check (可選，視乎你是否開放匿名下載，這裡為了安全加上)
        const auth = await requireAuth(context, req);
        if (!auth) return;

        // 3. Rate Limit
        const limited = rateLimit(req, auth.user);
        if (limited.limited) {
            context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429);
            return;
        }

        // 4. Get Input
        const { userScript } = req.body || {};
        if (!userScript || typeof userScript !== 'string') {
            // 如果沒有提供 Prompt，回傳一個預設的 timestamp 檔名
            context.res = ok({ filename: `generated-image-${Date.now()}` });
            return;
        }

        // 5. Call Gemini (Flash)
        const modelName = process.env.GEMINI_MODEL_ANALYSIS || "gemini-1.5-flash"; // 挑選快速的模型
        const model = getModel(modelName);

        const promptText = `
User Script: "${userScript}"

請產生對應的英文檔名：
`;

        const result = await model.generateContent([
            {
                role: "user",
                parts: [{ text: GENERATE_FILENAME_SYSTEM_MESSAGE + "\n" + promptText }]
            }
        ], {
            responseMimeType: "application/json"
        });

        // 6. Parse Result
        let data;
        try {
            data = parseGeminiResponse(result);

            // 安全防護：確保格式真的是 kebab-case，如果 AI 亂鬧，就做基礎的字串清理
            if (data && data.filename) {
                data.filename = data.filename
                    .toLowerCase()
                    .replace(/[^a-z0-9-]/g, '-') // 移除非英數與破折號
                    .replace(/-+/g, '-') // 合併重複的破折號
                    .replace(/^-|-$/g, ''); // 移除頭尾的破折號

                if (!data.filename) data.filename = `image-${Date.now()}`;
            } else {
                data = { filename: `generated-image-${Date.now()}` };
            }

        } catch (e) {
            context.log.error("[generate-filename] Failed to parse Gemini response:", e);
            data = {
                filename: `generated-image-${Date.now()}`
            };
        }

        context.res = ok(data);

    } catch (err) {
        context.log.error("[generate-filename] Error:", err.message);
        // 如果失敗，默默退回時間戳記，不該讓這個小功能卡死整個流程
        context.res = ok({
            filename: `generated-image-${Date.now()}`
        });
    }
};
