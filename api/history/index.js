const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { getImageJobForUser } = require("../_shared/imageJobs");
const { normalizeHistorySource } = require("../_shared/historySource");

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
      "SELECT id, image_url, prompt, user_script, style_prompt, model, image_job_id, style_id, source, created_at FROM history WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC",
      [identity.tenantId, identity.userId]
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      fullPrompt: row.prompt,
      userScript: row.user_script,
      stylePrompt: row.style_prompt,
      model: row.model,
      jobId: row.image_job_id,
      styleId: row.style_id,
      source: row.source,
      createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
    }));
    context.res = ok(items);
    return;
  }

  if (method === "POST") {
    const payload = req.body || {};
    if (
      typeof payload.jobId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.jobId)
    ) {
      context.res = error("請提供有效的圖片工作識別碼", "bad_request", 400, req);
      return;
    }
    if (typeof payload.imageUrl !== "string" || !payload.imageUrl.trim()) {
      context.res = error("缺少歷史圖片", "bad_request", 400, req);
      return;
    }
    const job = await getImageJobForUser({
      jobId: payload.jobId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!job) {
      context.res = error("找不到圖片生成工作", "not_found", 404, req);
      return;
    }
    if (job.status !== "succeeded") {
      context.res = error("圖片生成工作尚未成功完成", "not_ready", 409, req);
      return;
    }
    const result = await query(
      "INSERT INTO history (tenant_id, user_id, prompt, image_url, user_script, style_prompt, model, style_id, source, image_job_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, image_url, prompt, user_script, style_prompt, model, style_id, source, image_job_id, created_at",
      [
        identity.tenantId,
        identity.userId,
        payload.fullPrompt || null,
        payload.imageUrl,
        payload.userScript || null,
        payload.stylePrompt || null,
        job.model,
        payload.styleId || null,
        normalizeHistorySource(payload.source),
        job.id,
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
        model: row.model,
        jobId: row.image_job_id,
        styleId: row.style_id,
        source: row.source,
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
      "DELETE FROM history WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id",
      [id, identity.tenantId, identity.userId]
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
