const { ok, error, options, corsHeaders } = require("../_shared/http");
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
  if (!identity.userId || !identity.tenantId) {
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

  const asset = req.params?.asset;
  if (asset !== undefined) {
    if (asset !== "image") {
      context.res = error("API route not found", "not_found", 404, req);
      return;
    }
    if (job.status !== "succeeded") {
      context.res = error("圖片尚未完成", "not_ready", 409, req);
      return;
    }
    // A succeeded job's image never changes, so the browser may keep it.
    context.res = {
      status: 200,
      headers: {
        ...corsHeaders(req),
        "Content-Type": job.result_mime_type || "image/png",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
      body: await downloadGeneratedImage({ blobName: job.result_blob_name }),
    };
    return;
  }

  const body = {
    jobId: job.id,
    status: job.status,
    model: job.model,
    operation: job.operation,
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
    const isEdit = job.operation === "edit";
    body.error = {
      code: job.error_code || (isEdit ? "transform_failed" : "generation_failed"),
      message:
        job.error_message ||
        (isEdit ? "圖片轉換失敗，請稍後重試" : "圖片生成失敗，請稍後重試"),
    };
  }

  context.res = ok(body, 200, req);
};
