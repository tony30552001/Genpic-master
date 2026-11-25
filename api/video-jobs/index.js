const { error, options, corsHeaders } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const { rateLimit } = require("../_shared/rateLimit");
const { getGeneratedBlobDownload } = require("../_shared/blobStorage");
const { getVideoJobForUser } = require("../_shared/videoJobs");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Streams the MP4 of an owned succeeded segment. Generation and status live
// on /api/video-projects.
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
  if (!UUID_PATTERN.test(jobId || "")) {
    context.res = error("job id 格式無效", "bad_request", 400, req);
    return;
  }
  const job = await getVideoJobForUser({
    jobId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });
  if (!job) {
    context.res = error("找不到影片生成工作", "not_found", 404, req);
    return;
  }
  if (job.status !== "succeeded") {
    context.res = error("影片尚未完成", "not_ready", 409, req);
    return;
  }
  const blob = await getGeneratedBlobDownload({ blobName: job.result_blob_name });
  context.res = {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": job.result_mime_type || "video/mp4",
      "Content-Length": job.result_size_bytes || undefined,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
    body: blob.readableStreamBody,
  };
};