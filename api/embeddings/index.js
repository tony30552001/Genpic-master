const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { embedText } = require("../_shared/gemini");
const { defaultDim } = require("../_shared/vector");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  const { text } = req.body || {};
  if (!text || typeof text !== "string") {
    context.res = error("缺少文字內容", "bad_request", 400);
    return;
  }

  try {
    const modelName = process.env.EMBEDDING_MODEL || "text-embedding-004";
    const values = await embedText(modelName, text);
    if (!Array.isArray(values) || values.length !== defaultDim) {
      context.res = error("Embedding 回傳異常", "embedding_failed", 502);
      return;
    }

    context.res = ok({ embedding: values });
  } catch (err) {
    context.res = error("Embedding 產生失敗", "embedding_failed", 502);
  }
};
