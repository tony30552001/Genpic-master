const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { toVectorString } = require("../_shared/vector");

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

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  const { embedding, topK } = req.body || {};
  let vectorString;
  try {
    vectorString = toVectorString(embedding);
  } catch (err) {
    context.res = error(err.message, "bad_request", 400);
    return;
  }

  const limit = Math.min(Number(topK || 5), 20);
  const result = await query(
    "SELECT id, name, prompt, description, tags, preview_url, created_at, embedding <=> $2::vector AS distance FROM styles WHERE tenant_id = $1 AND created_by = $4 AND embedding IS NOT NULL ORDER BY embedding <=> $2::vector LIMIT $3",
    [identity.tenantId, vectorString, limit, identity.userId]
  );

  const items = result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    prompt: row.prompt,
    description: row.description,
    tags: row.tags || [],
    previewUrl: row.preview_url,
    distance: row.distance,
    createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
  }));

  context.res = ok(items);
};
