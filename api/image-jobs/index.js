const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { getImageJobForUser } = require("../_shared/imageJobs");
const { downloadGeneratedImage } = require("../_shared/blobStorage");

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || ""
  );

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

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }

  const jobId = req.params?.id;
  if (!isUuid(jobId)) {
    context.res = error("job id 格式無效", "bad_request", 400, req);
    return;
  }

  const job = await getImageJobForUser({
    jobId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  if (!job) {
    context.res = error("找不到圖片生成工作", "not_found", 404, req);
    return;
  }

  const body = {
    jobId: job.id,
    status: job.status,
    model: job.model,
    attempts: job.attempts,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  };

  if (job.status === "succeeded") {
    const imageBuffer = await downloadGeneratedImage({
      blobName: job.result_blob_name,
    });
    body.imageUrl = `data:${job.result_mime_type || "image/png"};base64,${imageBuffer.toString("base64")}`;
  } else if (job.status === "failed") {
    body.error = {
      code: job.error_code || "generation_failed",
      message: job.error_message || "圖片生成失敗，請稍後重試",
    };
  }

  context.res = ok(body, 200, req);
};
