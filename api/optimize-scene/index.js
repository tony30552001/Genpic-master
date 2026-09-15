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
const {
    SCENE_PROMPT_OPTIMIZER_SYSTEM_MESSAGE,
    buildSceneOptimizationUserMessage,
} = require("../_shared/imagePromptStrategy");

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
        const {
            scene_title,
            scene_description,
            visual_prompt,
            mood,
            key_elements,
            styleContext,
            imageLanguage,
            aspectRatio,
        } = req.body || {};

        if (!scene_title && !scene_description && !visual_prompt) {
            context.res = error("請提供場景資料", "bad_request", 400);
            return;
        }

        // Build prompt with the Gemini model assigned in the admin center.
        const identity = await resolveIdentity(auth.user);
        const llm = await resolveRoleModel(identity.tenantId, "scene_optimization");

        const imageTextDirective = buildImageTextDirective(imageLanguage);
        const inputText = buildSceneOptimizationUserMessage({
            sceneTitle: scene_title,
            sceneDescription: scene_description,
            visualPrompt: visual_prompt,
            mood,
            keyElements: key_elements,
            styleContext,
            imageTextDirective,
            aspectRatio,
        });

        // Parse
        let data;
        try {
            data = await generateJson({
                llm,
                systemMessage: SCENE_PROMPT_OPTIMIZER_SYSTEM_MESSAGE,
                userMessage: inputText,
                maxOutputTokens: 2400,
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
