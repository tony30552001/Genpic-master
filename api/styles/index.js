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

  const method = (req.method || "GET").toUpperCase();
  const id = req.params?.id;
  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  if (method === "GET") {
    const result = await query(
      "SELECT id, name, prompt, description, tags, preview_url, created_at FROM styles WHERE tenant_id = $1 AND created_by = $2 ORDER BY created_at DESC",
      [identity.tenantId, identity.userId]
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      description: row.description,
      tags: row.tags || [],
      previewUrl: row.preview_url,
      createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
    }));
    context.res = ok(items);
    return;
  }

  if (method === "POST") {
    const payload = req.body || {};
    let vectorString = null;
    if (payload.embedding) {
      try {
        vectorString = toVectorString(payload.embedding);
      } catch (err) {
        context.res = error(err.message, "bad_request", 400);
        return;
      }
    }
    const result = await query(
      "INSERT INTO styles (tenant_id, name, prompt, description, tags, preview_url, embedding, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8) RETURNING id, name, prompt, description, tags, preview_url, created_at",
      [
        identity.tenantId,
        payload.name,
        payload.prompt,
        payload.description || null,
        payload.tags || [],
        payload.previewUrl || null,
        vectorString,
        identity.userId,
      ]
    );
    const row = result.rows[0];
    context.res = ok(
      {
        id: row.id,
        name: row.name,
        prompt: row.prompt,
        description: row.description,
        tags: row.tags || [],
        previewUrl: row.preview_url,
        createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
      },
      201
    );
    return;
  }

  if (method === "DELETE") {
    // 支援從不同來源取得 id (Azure Functions bindingData, params, query)
    const targetId = id || context.bindingData?.id || req.query?.id;

    if (!targetId) {
      context.res = error("缺少 style id", "bad_request", 400);
      return;
    }

    // 先解除 history 表中的關聯 (Foreign Key Constraint)
    // 這裡只解除該使用者自己的 history 關聯，避免影響他人（雖然理論上 style 不應被他人引用）
    await query(
      "UPDATE history SET style_id = NULL WHERE style_id = $1 AND tenant_id = $2",
      [targetId, identity.tenantId]
    );

    // 再刪除 style
    const result = await query(
      "DELETE FROM styles WHERE id = $1 AND tenant_id = $2 AND created_by = $3 RETURNING id",
      [targetId, identity.tenantId, identity.userId]
    );
    if (result.rows.length === 0) {
      context.res = error("找不到 style 或無權限刪除", "not_found", 404);
      return;
    }
    context.res = ok(null, 204);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405);
};
