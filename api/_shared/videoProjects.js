const { query } = require("./db");
const { resolveOwnedImageUpload } = require("./imageUploads");
const { getImageJobForUser } = require("./imageJobs");
const { VideoModelError, validateVideoOptions } = require("./videoModelFamilies");
const { resolveVideoModel, withVideoModelTransaction } = require("./videoModels");
const { ensureVideoSettings } = require("./videoPolicy");
const { normalizeStoryboard, planSegments } = require("./videoStoryboard");
const videoRenderClient = require("./videoRenderClient");
const { countAdmittedToday, expiredElementError } = require("./videoJobs");
const { getLatestVideoRender, getSucceededRenderBlob, queueVideoRender } = require("./videoRenders");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const assertEnabledUser = async ({ client, tenantId, userId }) => {
  const result = await client.query(
    "SELECT video_enabled, video_unlimited FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
    [userId, tenantId]
  );
  if (!result.rows[0]?.video_enabled) {
    throw new VideoModelError("此帳號尚未開放影片創作，請聯絡管理員", "video_disabled", 403);
  }
  return Boolean(result.rows[0].video_unlimited);
};

const assertOwnedUpload = async ({ uploadId, tenantId, userId, message }) => {
  if (uploadId && !(await resolveOwnedImageUpload({ uploadId, tenantId, userId }))) {
    throw new VideoModelError(message, "upload_not_found", 404);
  }
};

const assertOwnedImageJob = async ({ jobId, tenantId, userId, message }) => {
  if (!jobId) return;
  const job = await getImageJobForUser({ jobId, tenantId, userId });
  if (job?.status !== "succeeded") throw new VideoModelError(message, "source_job_not_found", 404);
};

const assertOwnedSources = async ({ sources, tenantId, userId }) => {
  await assertOwnedUpload({
    uploadId: sources.sourceUploadId, tenantId, userId, message: "找不到可用的首影格上傳",
  });
  await assertOwnedImageJob({
    jobId: sources.sourceImageJobId, tenantId, userId, message: "找不到可用的圖片版本",
  });
  await assertOwnedUpload({
    uploadId: sources.endSourceUploadId, tenantId, userId, message: "找不到可用的尾影格上傳",
  });
  await assertOwnedImageJob({
    jobId: sources.endSourceImageJobId, tenantId, userId, message: "找不到可用的尾影格圖片版本",
  });
};

const assertOwnedElements = async ({ segments, tenantId, userId }) => {
  const checked = new Set();
  for (const segment of segments) {
    for (const element of segment.compiled.elements) {
      for (const uploadId of element.uploadIds) {
        if (checked.has(uploadId)) continue;
        if (!(await resolveOwnedImageUpload({ uploadId, tenantId, userId }))) {
          throw expiredElementError(element.name);
        }
        checked.add(uploadId);
      }
    }
  }
};

const assertOwnedStartFrames = async ({ segments, tenantId, userId }) => {
  for (const segment of segments) {
    await assertOwnedUpload({
      uploadId: segment.startFrameUploadId,
      tenantId,
      userId,
      message: `第 ${segment.index + 1} 段的首影格已過期或無法使用，請重新設定`,
    });
  }
};

const normalizeSources = (raw) => {
  const sources = {};
  for (const key of ["sourceUploadId", "sourceImageJobId", "endSourceUploadId", "endSourceImageJobId"]) {
    sources[key] = normalizeUuid(raw[key]);
    if (raw[key] && !sources[key]) throw new VideoModelError("來源識別碼格式無效");
  }
  return sources;
};

const assertSourceShape = ({ sources, mode, segmentCount }) => {
  const startCount = [sources.sourceUploadId, sources.sourceImageJobId].filter(Boolean).length;
  if ((mode === "t2v" && startCount !== 0) || (mode === "i2v" && startCount !== 1)) {
    throw new VideoModelError("影片生成來源設定無效");
  }
  const endCount = [sources.endSourceUploadId, sources.endSourceImageJobId].filter(Boolean).length;
  if (endCount > 1 || (endCount && mode !== "i2v")) throw new VideoModelError("尾影格來源設定無效");
  if (endCount && segmentCount > 1) {
    throw new VideoModelError(`尾影格只能用於單段影片，這份分鏡會分成 ${segmentCount} 段，請移除尾影格`);
  }
};

const assertQuota = async ({ client, tenantId, userId, settings, segmentCount }) => {
  const remaining = settings.dailyQuotaPerUser - (await countAdmittedToday(client, { tenantId, userId }));
  if (remaining <= 0) {
    throw new VideoModelError("今日影片額度已用完，請明天再試", "video_quota_exceeded", 429);
  }
  if (segmentCount > remaining) {
    throw new VideoModelError(
      `這支影片需要 ${segmentCount} 段，今日影片額度只剩 ${remaining} 段`,
      "video_quota_exceeded",
      429
    );
  }
};

/**
 * Admits a storyboard as one project: it is split into segments and every
 * segment becomes a video job. A chained segment waits for the previous job
 * and starts from its last frame; a segment whose first shot has a start
 * frame starts from that image. Each segment counts against the quota.
 */
const createVideoProject = async ({
  tenantId,
  userId,
  modelKey,
  storyboard: rawStoryboard,
  mode = "t2v",
  resolution,
  aspectRatio = "16:9",
  generateAudio = false,
  skipAdmission = false,
  ...rawSources
}) => {
  const storyboard = normalizeStoryboard(rawStoryboard);
  const sources = normalizeSources(rawSources);

  return withVideoModelTransaction(tenantId, async (client) => {
    const unlimited = skipAdmission ? true : await assertEnabledUser({ client, tenantId, userId });
    const settings = await ensureVideoSettings(tenantId, client);
    if (!skipAdmission && !settings.allowedModels.includes(modelKey)) {
      throw new VideoModelError("此影片模型尚未開放給使用者", "video_model_not_allowed", 403);
    }
    const model = await resolveVideoModel({ tenantId, modelKey, client });
    const segments = planSegments(storyboard, model, { mode });
    assertSourceShape({ sources, mode, segmentCount: segments.length });
    if (segments.some((segment) => segment.chained) && !videoRenderClient.isConfigured()) {
      throw new VideoModelError(
        "影片接續服務尚未設定，無法生成多段連續影片，請聯絡管理員",
        "video_render_unconfigured",
        503
      );
    }
    const options = segments.map((segment) =>
      validateVideoOptions({
        model,
        mode: segment.mode,
        durationSeconds: segment.durationSeconds,
        resolution,
        aspectRatio,
        generateAudio,
      })
    );
    await assertOwnedSources({ sources, tenantId, userId });
    await assertOwnedStartFrames({ segments, tenantId, userId });
    await assertOwnedElements({ segments, tenantId, userId });
    if (!unlimited) {
      await assertQuota({ client, tenantId, userId, settings, segmentCount: segments.length });
    }

    const project = (
      await client.query(
        `INSERT INTO video_projects (tenant_id, user_id, model_key, storyboard)
         VALUES ($1,$2,$3,$4)
         RETURNING id, created_at`,
        [tenantId, userId, modelKey, JSON.stringify(storyboard)]
      )
    ).rows[0];

    const jobs = [];
    for (const segment of segments) {
      const first = segment.index === 0;
      const option = options[segment.index];
      const inserted = await client.query(
        `INSERT INTO video_generation_jobs
         (tenant_id, user_id, model_key, mode, prompt, storyboard, duration_seconds,
          resolution, aspect_ratio, generate_audio, source_upload_id, source_image_job_id,
          end_source_upload_id, end_source_image_job_id, project_id, segment_index,
          previous_job_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING id, status, phase`,
        [
          tenantId, userId, modelKey, segment.mode, segment.compiled.storedPrompt,
          JSON.stringify(segment.storyboard),
          option.durationSeconds, option.resolution, option.aspectRatio, option.generateAudio,
          segment.startFrameUploadId || (first ? sources.sourceUploadId : null),
          first ? sources.sourceImageJobId : null,
          first ? sources.endSourceUploadId : null,
          first ? sources.endSourceImageJobId : null,
          project.id, segment.index,
          segment.chained ? jobs[segment.index - 1].id : null,
        ]
      );
      jobs.push(inserted.rows[0]);
    }
    return {
      projectId: project.id,
      segments: segments.map((segment) => ({
        index: segment.index,
        jobId: jobs[segment.index].id,
        durationSeconds: segment.durationSeconds,
        mode: segment.mode,
        chained: segment.chained,
      })),
    };
  });
};

const projectStatus = (segments) => {
  if (segments.some((segment) => segment.status === "failed")) return "failed";
  if (segments.every((segment) => segment.status === "succeeded")) return "succeeded";
  if (segments.some((segment) => segment.status !== "queued")) return "processing";
  return "queued";
};

const getVideoProjectForUser = async ({ projectId, tenantId, userId }) => {
  const project = await query(
    `SELECT id, model_key, storyboard, created_at
     FROM video_projects
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [projectId, tenantId, userId]
  );
  if (!project.rows[0]) return null;
  const jobs = await query(
    `SELECT id, segment_index, mode, status, phase, duration_seconds, prompt,
            previous_job_id, error_code, error_message, completed_at
     FROM video_generation_jobs
     WHERE project_id = $1
     ORDER BY segment_index`,
    [projectId]
  );
  const segments = jobs.rows.map((job) => ({
    index: job.segment_index,
    jobId: job.id,
    status: job.status,
    phase: job.phase,
    mode: job.mode,
    chained: Boolean(job.previous_job_id),
    durationSeconds: job.duration_seconds,
    prompt: job.prompt,
    completedAt: job.completed_at,
    ...(job.status === "failed"
      ? {
          error: {
            code: job.error_code || "video_generation_failed",
            message: job.error_message || "影片生成失敗，請稍後重試",
          },
        }
      : {}),
  }));
  const row = project.rows[0];
  return {
    projectId: row.id,
    modelKey: row.model_key,
    storyboard: row.storyboard,
    createdAt: row.created_at,
    status: projectStatus(segments),
    segments,
    render: segments.length > 1 ? await getLatestVideoRender(row.id) : null,
  };
};

/**
 * Requeues every failed segment of a project as new work: the provider
 * request, result and error are cleared and the job counts against today's
 * quota again. Succeeded segments are kept, and a chained segment still
 * waits for the one before it.
 */
const retryVideoProject = async ({ projectId, tenantId, userId }) => {
  await withVideoModelTransaction(tenantId, async (client) => {
    const project = await client.query(
      `SELECT model_key FROM video_projects
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3
       FOR UPDATE`,
      [projectId, tenantId, userId]
    );
    if (!project.rows[0]) throw new VideoModelError("找不到影片專案", "not_found", 404);
    const unlimited = await assertEnabledUser({ client, tenantId, userId });
    const settings = await ensureVideoSettings(tenantId, client);
    if (!settings.allowedModels.includes(project.rows[0].model_key)) {
      throw new VideoModelError("此影片模型尚未開放給使用者", "video_model_not_allowed", 403);
    }
    const failed = await client.query(
      `SELECT id FROM video_generation_jobs
       WHERE project_id = $1 AND status = 'failed'
       FOR UPDATE`,
      [projectId]
    );
    if (!failed.rows.length) {
      throw new VideoModelError("沒有需要重試的段落", "nothing_to_retry", 409);
    }
    if (!unlimited) {
      await assertQuota({ client, tenantId, userId, settings, segmentCount: failed.rows.length });
    }
    await client.query(
      `UPDATE video_generation_jobs
       SET status = 'queued', phase = 'queued', attempts = 0,
           lock_version = lock_version + 1, locked_at = NULL,
           provider_request_id = NULL, submitted_at = NULL, next_poll_at = NULL,
           available_at = now(), created_at = now(), started_at = NULL, completed_at = NULL,
           result_blob_name = NULL, result_mime_type = NULL, result_size_bytes = NULL,
           result_duration_seconds = NULL, last_frame_blob_name = NULL,
           error_code = NULL, error_message = NULL, updated_at = now()
       WHERE project_id = $1 AND status = 'failed'`,
      [projectId]
    );
  });
  return getVideoProjectForUser({ projectId, tenantId, userId });
};

/**
 * Queues the join of a finished multi-segment project into one MP4. Asking
 * again while a render is queued, running or done returns that render.
 */
const requestVideoRender = async ({ projectId, tenantId, userId }) => {
  const project = await getVideoProjectForUser({ projectId, tenantId, userId });
  if (!project) throw new VideoModelError("找不到影片專案", "not_found", 404);
  if (project.segments.length < 2) {
    throw new VideoModelError("單段影片不需要合併", "render_not_needed", 400);
  }
  if (project.status !== "succeeded") {
    throw new VideoModelError("所有段落完成後才能合併", "not_ready", 409);
  }
  if (!videoRenderClient.isConfigured()) {
    throw new VideoModelError("影片組合服務尚未設定，無法合併影片，請聯絡管理員", "video_render_unconfigured", 503);
  }
  return queueVideoRender({ tenantId, userId, projectId });
};

/**
 * The finished video of a project: its only segment, or its succeeded
 * render, or null while it has none. A missing project is a 404 error.
 * Without `userId` any project of the tenant resolves (management views).
 */
const resolveProjectVideo = async ({ projectId, tenantId, userId = null }) => {
  const project = await query(
    `SELECT id FROM video_projects
     WHERE id = $1 AND tenant_id = $2 AND ($3::uuid IS NULL OR user_id = $3)`,
    [projectId, tenantId, userId]
  );
  if (!project.rows[0]) throw new VideoModelError("找不到影片專案", "not_found", 404);
  const jobs = await query(
    `SELECT status, result_blob_name, result_mime_type, result_size_bytes
     FROM video_generation_jobs
     WHERE project_id = $1`,
    [projectId]
  );
  if (jobs.rows.length > 1) return getSucceededRenderBlob(projectId);
  const job = jobs.rows[0];
  return job?.status === "succeeded"
    ? { blobName: job.result_blob_name, contentType: job.result_mime_type || "video/mp4", sizeBytes: job.result_size_bytes }
    : null;
};

module.exports = {
  createVideoProject,
  getVideoProjectForUser,
  projectStatus,
  requestVideoRender,
  resolveProjectVideo,
  retryVideoProject,
};
