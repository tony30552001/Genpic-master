const { ok, error, options, corsHeaders } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const { rateLimit } = require("../_shared/rateLimit");
const { getGeneratedBlobDownload } = require("../_shared/blobStorage");
const { VideoModelError } = require("../_shared/videoModelFamilies");
const {
  createVideoJob,
  getVideoJobForUser,
} = require("../_shared/videoJobs");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requestIdentity = async (context, req) => {
  const auth = await requireAuth(context, req);
  if (!auth) return null;
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return null;
  }
  const identity = await resolveIdentity(auth.user);
  if (!identity.userId || !identity.tenantId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return null;
  }
  return identity;
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options(req);
    return;
  }
  const identity = await requestIdentity(context, req);
  if (!identity) return;

  try {
    const method = (req.method || "GET").toUpperCase();
    if (method === "POST" && !req.params?.id) {
      const payload = req.body || {};
      const job = await createVideoJob({
        tenantId: identity.tenantId,
        userId: identity.userId,
        modelKey: payload.modelKey,
        prompt: payload.prompt,
        originalPrompt: payload.originalPrompt,
        mode: payload.mode,
        durationSeconds: payload.durationSeconds,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        generateAudio: payload.generateAudio,
        sourceUploadId: payload.sourceUploadId,
        sourceImageJobId: payload.sourceImageJobId,
        endSourceUploadId: payload.endSourceUploadId,
        endSourceImageJobId: payload.endSourceImageJobId,
      });
      context.res = ok(
        { jobId: job.id, status: job.status, phase: job.phase, modelKey: job.model_key },
        202,
        req
      );
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
    if (req.params?.asset !== undefined) {
      if (req.params.asset !== "video" || job.status !== "succeeded") {
        context.res = error(
          req.params.asset !== "video" ? "API route not found" : "影片尚未完成",
          req.params.asset !== "video" ? "not_found" : "not_ready",
          req.params.asset !== "video" ? 404 : 409,
          req
        );
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
      return;
    }
    context.res = ok(
      {
        jobId: job.id,
        modelKey: job.model_key,
        mode: job.mode,
        prompt: job.prompt,
        status: job.status,
        phase: job.phase,
        attempts: job.attempts,
        durationSeconds: job.duration_seconds,
        resolution: job.resolution,
        aspectRatio: job.aspect_ratio,
        generateAudio: job.generate_audio,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        ...(job.status === "failed"
          ? {
              error: {
                code: job.error_code || "video_generation_failed",
                message: job.error_message || "影片生成失敗，請稍後重試",
              },
            }
          : {}),
      },
      200,
      req
    );
  } catch (caught) {
    if (caught instanceof VideoModelError) {
      context.res = error(caught.message, caught.code, caught.status, req);
      return;
    }
    throw caught;
  }
};
