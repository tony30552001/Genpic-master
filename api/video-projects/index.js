const { ok, error, options, corsHeaders } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const { rateLimit } = require("../_shared/rateLimit");
const { getGeneratedBlobDownload } = require("../_shared/blobStorage");
const { createVideoPlayback } = require("../_shared/videoPlayback");
const { VideoModelError } = require("../_shared/videoModelFamilies");
const {
  cancelVideoProject,
  createVideoProject,
  getVideoProjectForUser,
  requestVideoRender,
  resolveProjectSubtitles,
  resolveProjectVideo,
  retryVideoProject,
} = require("../_shared/videoProjects");

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
  const method = (req.method || "GET").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }
  const identity = await requestIdentity(context, req);
  if (!identity) return;

  try {
    if (method === "POST" && !req.params?.id) {
      const payload = req.body || {};
      const project = await createVideoProject({
        tenantId: identity.tenantId,
        userId: identity.userId,
        modelKey: payload.modelKey,
        storyboard: payload.storyboard,
        mode: payload.mode,
        resolution: payload.resolution,
        aspectRatio: payload.aspectRatio,
        generateAudio: payload.generateAudio,
        sourceUploadId: payload.sourceUploadId,
        sourceImageJobId: payload.sourceImageJobId,
        endSourceUploadId: payload.endSourceUploadId,
        endSourceImageJobId: payload.endSourceImageJobId,
        baseProjectId: payload.baseProjectId,
      });
      context.res = ok(project, 202, req);
      return;
    }
    const projectId = req.params?.id;
    if (!UUID_PATTERN.test(projectId || "")) {
      context.res = error("影片專案識別碼格式無效", "bad_request", 400, req);
      return;
    }
    const action = req.params?.action;
    if (method === "POST" && action === "cancel") {
      const project = await cancelVideoProject({ projectId, tenantId: identity.tenantId, userId: identity.userId });
      context.res = ok(project, 200, req);
      return;
    }
    if (method === "POST" && action === "render") {
      const render = await requestVideoRender({
        projectId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      });
      context.res = ok(render, 202, req);
      return;
    }
    if (method === "POST" && action === "retry") {
      const project = await retryVideoProject({
        projectId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      });
      context.res = ok(project, 202, req);
      return;
    }
    if (method === "GET" && (action === "video" || action === "playback")) {
      const video = await resolveProjectVideo({
        projectId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      });
      if (!video) {
        context.res = error("影片尚未完成", "not_ready", 409, req);
        return;
      }
      if (action === "playback") {
        context.res = ok(createVideoPlayback(video.blobName), 200, req);
        context.res.headers["Cache-Control"] = "no-store";
        return;
      }
      const blob = await getGeneratedBlobDownload({ blobName: video.blobName });
      context.res = {
        status: 200,
        headers: {
          ...corsHeaders(req),
          "Content-Type": video.contentType,
          "Content-Length": video.sizeBytes || undefined,
          "Cache-Control": "private, max-age=31536000, immutable",
        },
        body: blob.readableStreamBody,
      };
      return;
    }
    if (method === "GET" && action === "subtitles") {
      const subtitle = await resolveProjectSubtitles({
        projectId,
        tenantId: identity.tenantId,
        userId: identity.userId,
      });
      if (!subtitle) {
        context.res = error("此影片專案沒有字幕檔", "not_found", 404, req);
        return;
      }
      const blob = await getGeneratedBlobDownload({ blobName: subtitle.blobName });
      const safeName = encodeURIComponent(`${subtitle.title || "subtitles"}.srt`);
      context.res = {
        status: 200,
        headers: {
          ...corsHeaders(req),
          "Content-Type": subtitle.contentType,
          "Content-Length": subtitle.sizeBytes || undefined,
          "Content-Disposition": `attachment; filename="subtitles.srt"; filename*=UTF-8''${safeName}`,
          "Cache-Control": "private, max-age=31536000, immutable",
        },
        body: blob.readableStreamBody,
      };
      return;
    }
    if (method !== "GET" || action) {
      context.res = error("Method not allowed", "method_not_allowed", 405, req);
      return;
    }
    const project = await getVideoProjectForUser({
      projectId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!project) {
      context.res = error("找不到影片專案", "not_found", 404, req);
      return;
    }
    context.res = ok(project, 200, req);
  } catch (caught) {
    if (caught instanceof VideoModelError) {
      context.res = error(caught.message, caught.code, caught.status, req);
      return;
    }
    throw caught;
  }
};
