const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { getImageJobForUser } = require("../_shared/imageJobs");
const { getVideoProjectForUser, resolveProjectVideo } = require("../_shared/videoProjects");
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
      "SELECT id, image_url, prompt, user_script, style_prompt, model, image_job_id, video_project_id, style_id, source, created_at FROM history WHERE tenant_id = $1 AND user_id = $2 ORDER BY created_at DESC",
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
      videoProjectId: row.video_project_id,
      styleId: row.style_id,
      source: row.source,
      createdAt: { seconds: Math.floor(new Date(row.created_at).getTime() / 1000) },
    }));
    context.res = ok(items);
    return;
  }

  if (method === "POST") {
    const payload = req.body || {};
    const isImage = typeof payload.jobId === "string";
    const isVideo = typeof payload.videoProjectId === "string";
    if (isImage === isVideo) {
      context.res = error("歷史紀錄必須指定單一圖片工作或影片專案", "bad_request", 400, req);
      return;
    }
    const selectedJobId = isImage ? payload.jobId : payload.videoProjectId;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(selectedJobId)) {
      context.res = error("請提供有效的生成工作識別碼", "bad_request", 400, req);
      return;
    }
    if (isImage && (typeof payload.imageUrl !== "string" || !payload.imageUrl.trim())) {
      context.res = error("缺少歷史圖片", "bad_request", 400, req);
      return;
    }
    const owner = { tenantId: identity.tenantId, userId: identity.userId };
    const job = isImage
      ? await getImageJobForUser({ jobId: selectedJobId, ...owner })
      : await getVideoProjectForUser({ projectId: selectedJobId, ...owner });
    if (!job) {
      context.res = error(isImage ? "找不到生成工作" : "找不到影片專案", "not_found", 404, req);
      return;
    }
    const ready = isImage
      ? job.status === "succeeded"
      : Boolean(await resolveProjectVideo({ projectId: job.projectId, ...owner }));
    if (!ready) {
      context.res = error(
        isImage ? "生成工作尚未成功完成" : "影片尚未完成；多段影片需先合併成一支影片",
        "not_ready",
        409,
        req
      );
      return;
    }
    const result = await query(
      `INSERT INTO history
       (tenant_id, user_id, prompt, image_url, user_script, style_prompt, model,
        style_id, source, image_job_id, video_project_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id, image_url, prompt, user_script, style_prompt, model, style_id,
                 source, image_job_id, video_project_id, created_at`,
      [
        identity.tenantId,
        identity.userId,
        payload.fullPrompt || null,
        isImage ? payload.imageUrl : null,
        payload.userScript || null,
        payload.stylePrompt || null,
        isImage ? job.model : job.modelKey,
        payload.styleId || null,
        normalizeHistorySource(payload.source),
        isImage ? job.id : null,
        isVideo ? job.projectId : null,
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
        videoProjectId: row.video_project_id,
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
