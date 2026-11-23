const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { LlmConfigurationError, resolveRoleModel } = require("../_shared/llmModels");
const { generateJson } = require("../_shared/llmRuntime");

const SYSTEM_MESSAGE = `You optimize prompts for short AI-generated videos.
Return JSON with exactly: {"optimizedPrompt":"...","explanation":"..."}.
Preserve the user's meaning and every explicitly quoted text verbatim. Add useful camera movement,
lighting, timing, subject motion, and composition. Do not invent written signs or logos.`;

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options(req);
    return;
  }
  const auth = await requireAuth(context, req);
  if (!auth) return;
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt || prompt.length > 20_000) {
    context.res = error("請提供 1 至 20000 字元的影片描述", "bad_request", 400, req);
    return;
  }
  try {
    const identity = await resolveIdentity(auth.user);
    const llm = await resolveRoleModel(identity.tenantId, "prompt_optimization");
    const data = await generateJson({
      llm,
      systemMessage: SYSTEM_MESSAGE,
      userMessage: prompt,
      maxOutputTokens: 2000,
    });
    if (
      typeof data?.optimizedPrompt !== "string" ||
      !data.optimizedPrompt.trim() ||
      typeof data?.explanation !== "string"
    ) {
      throw new Error("分析模型回傳缺少必要的優化欄位");
    }
    const quotedText = [...prompt.matchAll(/[「『"“]([^」』"”]+)[」』"”]/g)].map((match) => match[1]);
    const optimizedPrompt = data.optimizedPrompt.trim();
    const missingQuotedText = quotedText.filter((text) => !optimizedPrompt.includes(text));
    if (missingQuotedText.length) {
      throw new Error("分析模型未保留指定文字，請關閉 AI 優化後重試");
    }
    context.res = ok({ optimizedPrompt, explanation: data.explanation.trim() }, 200, req);
  } catch (caught) {
    if (caught instanceof LlmConfigurationError) {
      context.res = error(caught.message, caught.code, caught.status, req);
      return;
    }
    context.res = error(caught.message || "影片提示詞優化失敗", "video_prompt_failed", 502, req);
  }
};
