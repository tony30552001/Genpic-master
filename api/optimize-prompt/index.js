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
    IMAGE_PROMPT_OPTIMIZER_SYSTEM_MESSAGE,
    buildPromptOptimizationUserMessage,
} = require("../_shared/imagePromptStrategy");

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
        const {
            userScript,
            styleContext,
            imageLanguage,
            imagePurpose,
            aspectRatio,
            optimizationMode,
            transformMode,
        } = req.body || {};
        if (typeof userScript !== "string" || !userScript.trim()) {
            context.res = error("請提供需要優化的描述 (userScript)", "bad_request", 400);
            return;
        }

        const imageTextDirective = buildImageTextDirective(imageLanguage);
        const promptText = buildPromptOptimizationUserMessage({
            userScript: userScript.trim(),
            styleContext,
            imageTextDirective,
            imagePurpose,
            aspectRatio,
            optimizationMode,
            transformMode,
        });

        // 5. Call the analysis model assigned to this role in the admin center.
        const identity = await resolveIdentity(auth.user);
        const llm = await resolveRoleModel(identity.tenantId, "prompt_optimization");
        const data = await generateJson({
            llm,
            systemMessage: IMAGE_PROMPT_OPTIMIZER_SYSTEM_MESSAGE,
            userMessage: promptText,
            maxOutputTokens: 2000,
        });

        if (
            !data ||
            typeof data.optimizedPromptZh !== "string" || !data.optimizedPromptZh.trim() ||
            typeof data.optimizedPromptEn !== "string" || !data.optimizedPromptEn.trim() ||
            typeof data.explanation !== "string" || !data.explanation.trim()
        ) {
            throw new Error("分析模型回傳缺少必要的優化欄位");
        }

        context.res = ok({
            optimizedPromptZh: data.optimizedPromptZh.trim(),
            optimizedPromptEn: data.optimizedPromptEn.trim(),
            explanation: data.explanation.trim(),
        });

    } catch (err) {
        context.log.error("[optimize-prompt] Error:", err.message);
        if (err instanceof LlmConfigurationError) {
            context.res = error(err.message, err.code, err.status);
            return;
        }
        context.res = error("優化失敗: " + err.message, "internal_error", 500);
    }
};
