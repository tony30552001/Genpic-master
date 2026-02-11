const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");

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

  const method = (req.method || "GET").toUpperCase();
  const id = req.params?.id;
  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  if (method === "GET") {
    const result = await query(
      "SELECT id, image_url, prompt, user_script, style_prompt, style_id, created_at FROM history WHERE tenant_id = $1 ORDER BY created_at DESC",
      [identity.tenantId]
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      fullPrompt: row.prompt,
      userScript: row.user_script,
      stylePrompt: row.style_prompt,
      styleId: row.style_id,
      createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
    }));
    context.res = ok(items);
    return;
  }

  if (method === "POST") {
    const payload = req.body || {};
    const result = await query(
      "INSERT INTO history (tenant_id, user_id, prompt, image_url, user_script, style_prompt, style_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, image_url, prompt, user_script, style_prompt, style_id, created_at",
      [
        identity.tenantId,
        identity.userId,
        payload.fullPrompt || null,
        payload.imageUrl,
        payload.userScript || null,
        payload.stylePrompt || null,
        payload.styleId || null,
      ]
    );
    const row = result.rows[0];
    context.res = ok(
      {
        id: row.id,
        imageUrl: row.image_url,
        fullPrompt: row.prompt,
        userScript: row.user_script,
        stylePrompt: row.style_prompt,
        styleId: row.style_id,
        createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
      },
      201
    );
    return;
  }

  if (method === "DELETE") {
    if (!id) {
      context.res = error("缺少 history id", "bad_request", 400);
      return;
    }
    const result = await query(
      "DELETE FROM history WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [id, identity.tenantId]
    );
    if (result.rows.length === 0) {
      context.res = error("找不到 history", "not_found", 404);
      return;
    }
    context.res = ok(null, 204);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405);
};
