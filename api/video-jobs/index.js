const sharp = require("sharp");
const { ok, error, options, corsHeaders } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const { rateLimit } = require("../_shared/rateLimit");
const { downloadGeneratedImage, getGeneratedBlobDownload } = require("../_shared/blobStorage");
const { createReadyImageUpload } = require("../_shared/imageUploads");
const { getVideoJobForUser, previousFrameBlobName } = require("../_shared/videoJobs");
const { createVideoPlayback } = require("../_shared/videoPlayback");
const { VideoRenderError } = require("../_shared/videoRenderClient");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
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
  const action = req.params?.action;
  if (!(method === "GET" && ["playback", "video"].includes(action)) && !(method === "POST" && action === "last-frame")) {
    context.res = error("Method not allowed", "method_not_allowed", 405, req);
    return;
  }
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
  if (job.status !== "succeeded" || !job.result_blob_name) {
    context.res = error("影片尚未完成", "not_ready", 409, req);
    return;
  }
  if (action === "playback") {
    context.res = ok(createVideoPlayback(job.result_blob_name), 200, req);
    context.res.headers["Cache-Control"] = "no-store";
    return;
  }
  if (action === "last-frame") {
    try {
      const blobName = await previousFrameBlobName(jobId);
      const buffer = await downloadGeneratedImage({ blobName });
      const preview = await sharp(buffer).resize({ width: 240, height: 240, fit: "inside", withoutEnlargement: true }).webp().toBuffer();
      const uploadId = await createReadyImageUpload({
        tenantId: identity.tenantId, userId: identity.userId, buffer, contentType: "image/png", fileName: "last-frame.png",
      });
      context.res = ok({ uploadId, previewUrl: `data:image/webp;base64,${preview.toString("base64")}` }, 201, req);
    } catch (caught) {
      if (!(caught instanceof VideoRenderError)) throw caught;
      context.res = error("無法擷取影片尾幀，請稍後再試或聯絡管理員", caught.code, 503, req);
    }
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