const crypto = require("node:crypto");
const { query } = require("./db");
const { uploadGeneratedBlob } = require("./blobStorage");
const { resolveOwnedImageUpload } = require("./imageUploads");
const { getImageJobForUser } = require("./imageJobs");
const { VideoModelError, getVideoModelFamily, validateVideoOptions } = require("./videoModelFamilies");
const { resolveVideoModel, withVideoModelTransaction } = require("./videoModels");
const { ensureVideoSettings, resolveSpeechConfig } = require("./videoPolicy");
const { SpeechTtsError, synthesizeSpeech } = require("./speechTts");
const {
  applyNarrationDurations,
  normalizeStoryboard,
  planSegments,
  storyboardNeedsRender,
} = require("./videoStoryboard");
const videoRenderClient = require("./videoRenderClient");
const { countAdmittedToday, expiredElementError } = require("./videoJobs");
const {
  getLatestVideoRender,
  getSucceededRenderBlob,
  getSucceededRenderSubtitleBlob,
  queueCompletedProjectRender,
  queueVideoRender,
} = require("./videoRenders");

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

const assertOwnedImageShots = async ({ storyboard, tenantId, userId }) => {
  for (let index = 0; index < storyboard.shots.length; index += 1) {
    const shot = storyboard.shots[index];
    if (shot.source !== "image") continue;
    await assertOwnedUpload({
      uploadId: shot.uploadId,
      tenantId,
      userId,
      message: `第 ${index + 1} 幕的靜態圖片已過期或無法使用，請重新上傳`,
    });
    await assertOwnedImageJob({
      jobId: shot.imageJobId,
      tenantId,
      userId,
      message: `第 ${index + 1} 幕的靜態圖片版本無法使用，請重新選擇`,
    });
  }
};

const synthesizeProjectNarrations = async ({ projectId, tenantId, storyboard }) => {
  const narratedShots = storyboard.shots.filter((shot) => Boolean(shot.narration));
  if (!narratedShots.length) {
    return { storyboard, narrationAssets: null };
  }
  if (!videoRenderClient.isConfigured()) {
    throw new VideoModelError(
      "影片組合服務尚未設定，無法合成旁白與字幕，請聯絡管理員",
      "video_render_unconfigured",
      503
    );
  }
  const speechConfig = await resolveSpeechConfig(tenantId);
  if (!speechConfig) {
    throw new VideoModelError(
      "尚未設定語音旁白服務（Azure AI Speech），請聯絡管理員設定後再試",
      "speech_unconfigured",
      503
    );
  }

  const narrationAssets = {};
  const durationsByShotId = {};
  const voice = storyboard.global.voice;
  for (const shot of narratedShots) {
    let synthesized;
    try {
      synthesized = await synthesizeSpeech({
        speechConfig,
        text: shot.narration,
        voice,
      });
    } catch (caught) {
      if (caught instanceof SpeechTtsError) {
        throw new VideoModelError(caught.message, caught.code, caught.status);
      }
      throw caught;
    }
    const blobName = `videos/projects/${projectId}/narration/${shot.id}.wav`;
    await uploadGeneratedBlob({
      blobName,
      buffer: synthesized.audioBuffer,
      contentType: synthesized.contentType,
    });
    narrationAssets[shot.id] = {
      blobName,
      durationSeconds: synthesized.durationSeconds,
      characters: synthesized.characters,
      cues: synthesized.cues,
    };
    durationsByShotId[shot.id] = synthesized.durationSeconds;
  }

  const adjusted = applyNarrationDurations(storyboard, durationsByShotId);
  return { storyboard: adjusted, narrationAssets };
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

// The start sources a segment's job is created with: the request's own
// sources apply to the first segment, a shot's start frame to its segment.
const segmentSources = (segment, sources) => {
  const first = segment.index === 0;
  return {
    sourceUploadId: segment.startFrameUploadId || (first ? sources.sourceUploadId : null),
    sourceImageJobId: first ? sources.sourceImageJobId : null,
    endSourceUploadId: first ? sources.endSourceUploadId : null,
    endSourceImageJobId: first ? sources.endSourceImageJobId : null,
  };
};

/**
 * Finds, for each planned segment, a succeeded job of the owned base project
 * made from exactly the same request, so a storyboard edited from that project
 * only generates the segments that changed. A chained segment is reusable
 * only together with the segment before it, whose last frame it starts from.
 */
const findReusableJobs = async ({ client, baseProjectId, tenantId, userId, modelKey, segments, options, sources }) => {
  const reused = [];
  for (const segment of segments) {
    const previous = segment.chained ? reused[segment.index - 1] : null;
    if (!baseProjectId || (segment.chained && !previous)) {
      reused.push(null);
      continue;
    }
    const option = options[segment.index];
    const start = segmentSources(segment, sources);
    const result = await client.query(
      `SELECT jobs.id FROM video_generation_jobs jobs
       JOIN video_projects projects ON projects.id = jobs.project_id
       WHERE projects.id = $1 AND projects.tenant_id = $2 AND projects.user_id = $3
         AND jobs.status = 'succeeded' AND jobs.model_key = $4 AND jobs.mode = $5
         AND jobs.prompt = $6 AND jobs.storyboard = $7::jsonb AND jobs.duration_seconds = $8
         AND jobs.resolution IS NOT DISTINCT FROM $9 AND jobs.aspect_ratio IS NOT DISTINCT FROM $10
         AND jobs.generate_audio = $11
         AND jobs.source_upload_id IS NOT DISTINCT FROM $12
         AND jobs.source_image_job_id IS NOT DISTINCT FROM $13
         AND jobs.end_source_upload_id IS NOT DISTINCT FROM $14
         AND jobs.end_source_image_job_id IS NOT DISTINCT FROM $15
         AND jobs.previous_job_id IS NOT DISTINCT FROM $16
       ORDER BY jobs.segment_index
       LIMIT 1`,
      [
        baseProjectId, tenantId, userId, modelKey, segment.mode,
        segment.compiled.storedPrompt, JSON.stringify(segment.storyboard), option.durationSeconds,
        option.resolution ?? null, option.aspectRatio ?? null, option.generateAudio,
        start.sourceUploadId, start.sourceImageJobId, start.endSourceUploadId, start.endSourceImageJobId,
        previous,
      ]
    );
    reused.push(result.rows[0]?.id || null);
  }
  return reused;
};

/**
 * Admits a storyboard as one project: it is split into segments and every
 * segment becomes a video job. A chained segment waits for the previous job
 * and starts from its last frame; a segment whose first shot has a start
 * frame starts from that image. Each generated segment counts against the
 * quota. With `baseProjectId`, segments unchanged from that project are
 * copied as already succeeded instead of being generated again.
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
  baseProjectId: rawBaseProjectId = null,
  ...rawSources
}) => {
  const initialStoryboard = normalizeStoryboard(rawStoryboard);
  const sources = normalizeSources(rawSources);
  const baseProjectId = normalizeUuid(rawBaseProjectId);
  if (rawBaseProjectId && !baseProjectId) throw new VideoModelError("原影片專案識別碼格式無效");

  // Synthesize TTS before opening the DB transaction so external Speech calls
  // never hold tenant transaction locks; durations are then fed back into
  // planSegments so segment boundaries reflect real audio length.
  const projectId = crypto.randomUUID();
  const { storyboard, narrationAssets } = await synthesizeProjectNarrations({
    projectId,
    tenantId,
    storyboard: initialStoryboard,
  });

  return withVideoModelTransaction(tenantId, async (client) => {
    const unlimited = skipAdmission ? true : await assertEnabledUser({ client, tenantId, userId });
    const settings = await ensureVideoSettings(tenantId, client);
    if (!skipAdmission && !settings.allowedModels.includes(modelKey)) {
      throw new VideoModelError("此影片模型尚未開放給使用者", "video_model_not_allowed", 403);
    }
    const model = await resolveVideoModel({ tenantId, modelKey, client });
    const family = getVideoModelFamily(model.family);
    const segments = planSegments(storyboard, model, { mode });
    const needsRender = storyboardNeedsRender(storyboard, segments.length);
    assertSourceShape({ sources, mode, segmentCount: segments.length });
    if (needsRender && !videoRenderClient.isConfigured()) {
      throw new VideoModelError(
        "影片組合服務尚未設定，無法合成此影片專案，請聯絡管理員",
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
        // Mute Kling native audio on narrated segments so it cannot clash with voiceover.
        generateAudio: segment.hasNarration && family.supportsAudio ? false : generateAudio,
      })
    );
    const reused = await findReusableJobs({
      client, baseProjectId, tenantId, userId, modelKey, segments, options, sources,
    });
    const generated = segments.filter((segment) => !reused[segment.index]);
    if (segments.length && !reused[0]) await assertOwnedSources({ sources, tenantId, userId });
    await assertOwnedImageShots({ storyboard, tenantId, userId });
    await assertOwnedStartFrames({ segments: generated, tenantId, userId });
    await assertOwnedElements({ segments: generated, tenantId, userId });
    if (!unlimited && generated.length) {
      await assertQuota({ client, tenantId, userId, settings, segmentCount: generated.length });
    }

    const project = (
      await client.query(
        `INSERT INTO video_projects
         (id, tenant_id, user_id, model_key, storyboard, aspect_ratio, generate_audio, needs_render, narration_assets)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, created_at`,
        [
          projectId,
          tenantId,
          userId,
          modelKey,
          JSON.stringify(storyboard),
          aspectRatio || "16:9",
          Boolean(generateAudio),
          needsRender,
          narrationAssets ? JSON.stringify(narrationAssets) : null,
        ]
      )
    ).rows[0];

    const jobs = [];
    for (const segment of segments) {
      const previousJobId = segment.chained ? jobs[segment.index - 1].id : null;
      if (reused[segment.index]) {
        const copied = await client.query(
          `INSERT INTO video_generation_jobs
           (tenant_id, user_id, model_key, mode, prompt, storyboard, duration_seconds,
            resolution, aspect_ratio, generate_audio, source_upload_id, source_image_job_id,
            end_source_upload_id, end_source_image_job_id, project_id, segment_index,
            previous_job_id, reused_from_job_id, status, phase, completed_at,
            result_blob_name, result_mime_type, result_size_bytes, result_duration_seconds,
            last_frame_blob_name)
           SELECT tenant_id, user_id, model_key, mode, prompt, storyboard, duration_seconds,
                  resolution, aspect_ratio, generate_audio, source_upload_id, source_image_job_id,
                  end_source_upload_id, end_source_image_job_id, $2::uuid, $3::integer,
                  $4::uuid, id, 'succeeded', 'completed', now(),
                  result_blob_name, result_mime_type, result_size_bytes, result_duration_seconds,
                  last_frame_blob_name
           FROM video_generation_jobs
           WHERE id = $1
           RETURNING id, status, phase`,
          [reused[segment.index], project.id, segment.index, previousJobId]
        );
        jobs.push(copied.rows[0]);
        continue;
      }
      const option = options[segment.index];
      const start = segmentSources(segment, sources);
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
          start.sourceUploadId, start.sourceImageJobId, start.endSourceUploadId, start.endSourceImageJobId,
          project.id, segment.index, previousJobId,
        ]
      );
      jobs.push(inserted.rows[0]);
    }
    if (!generated.length && needsRender) await queueCompletedProjectRender(client, project.id);
    return {
      projectId: project.id,
      needsRender,
      storyboard,
      segments: segments.map((segment) => ({
        index: segment.index,
        jobId: jobs[segment.index].id,
        status: jobs[segment.index].status,
        durationSeconds: segment.durationSeconds,
        mode: segment.mode,
        chained: segment.chained,
        shotIds: segment.shotIds,
        reused: Boolean(reused[segment.index]),
        reusedFromJobId: reused[segment.index] || null,
      })),
    };
  });
};

const projectStatus = (segments) => {
  if (!segments.length) return "succeeded";
  if (segments.some((segment) => segment.status === "cancelled")) {
    return segments.some((segment) => ["queued", "processing"].includes(segment.status)) ? "processing" : "cancelled";
  }
  if (segments.some((segment) => segment.status === "failed")) return "failed";
  if (segments.every((segment) => segment.status === "succeeded")) return "succeeded";
  if (segments.some((segment) => segment.status !== "queued")) return "processing";
  return "queued";
};

const cancelVideoProject = async ({ projectId, tenantId, userId }) => {
  const params = [projectId, tenantId, userId];
  await withVideoModelTransaction(tenantId, async (client) => {
    const owned = await client.query(
      "SELECT id FROM video_projects WHERE id = $1 AND tenant_id = $2 AND user_id = $3 FOR UPDATE", params
    );
    if (!owned.rows.length) throw new VideoModelError("找不到影片專案", "not_found", 404);
    const cancelled = await client.query(
      `UPDATE video_generation_jobs SET status = 'cancelled', phase = 'completed', lock_version = lock_version + 1,
         completed_at = now(), updated_at = now(), error_code = NULL, error_message = NULL
       WHERE project_id = $1 AND tenant_id = $2 AND user_id = $3
         AND status = 'queued' AND provider_request_id IS NULL`, params
    );
    if (!cancelled.rowCount) {
      const prior = await client.query("SELECT 1 FROM video_generation_jobs WHERE project_id = $1 AND status = 'cancelled' LIMIT 1", [projectId]);
      if (!prior.rows.length) throw new VideoModelError("已沒有排隊中的分段；送出中的分段無法取消", "nothing_to_cancel", 409);
    }
  });
  return getVideoProjectForUser({ projectId, tenantId, userId });
};

const getVideoProjectForUser = async ({ projectId, tenantId, userId }) => {
  const project = await query(
    `SELECT id, model_key, storyboard, aspect_ratio, generate_audio, needs_render, created_at
     FROM video_projects
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [projectId, tenantId, userId]
  );
  if (!project.rows[0]) return null;
  const jobs = await query(
    `SELECT id, segment_index, mode, status, phase, duration_seconds, prompt, storyboard,
            previous_job_id, reused_from_job_id, error_code, error_message, completed_at
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
    shotIds: job.storyboard.shots.map((shot) => shot.id),
    reused: Boolean(job.reused_from_job_id),
    reusedFromJobId: job.reused_from_job_id,
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
  const needsRender = Boolean(row.needs_render) || segments.length !== 1;
  const render = needsRender ? await getLatestVideoRender(row.id) : null;
  return {
    projectId: row.id,
    modelKey: row.model_key,
    storyboard: row.storyboard,
    aspectRatio: row.aspect_ratio || "16:9",
    generateAudio: Boolean(row.generate_audio),
    needsRender,
    hasSubtitles: Boolean(render?.hasSubtitles),
    createdAt: row.created_at,
    status: projectStatus(segments),
    segments,
    render,
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
    const cancelled = await client.query(
      "SELECT 1 FROM video_generation_jobs WHERE project_id = $1 AND status = 'cancelled' LIMIT 1", [projectId]
    );
    if (cancelled.rows.length) throw new VideoModelError("已取消的專案不可重試，請重新生成", "project_cancelled", 409);
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
           provider_request_id = NULL, submitted_at = NULL, used_elements = NULL, next_poll_at = NULL,
           available_at = now(), created_at = now(), started_at = NULL, completed_at = NULL,
           result_blob_name = NULL, result_mime_type = NULL, result_size_bytes = NULL,
           result_duration_seconds = NULL, last_frame_blob_name = NULL,
           error_code = NULL, error_message = NULL, updated_at = now()
       WHERE id = ANY($1::uuid[]) AND status = 'failed'`,
      [failed.rows.map((row) => row.id)]
    );
  });
  return getVideoProjectForUser({ projectId, tenantId, userId });
};

/**
 * Queues timeline composition for a finished project that requires rendering.
 * Asking again while a render is queued, running or done returns that render.
 */
const requestVideoRender = async ({ projectId, tenantId, userId }) => {
  const project = await getVideoProjectForUser({ projectId, tenantId, userId });
  if (!project) throw new VideoModelError("找不到影片專案", "not_found", 404);
  if (!project.needsRender) {
    throw new VideoModelError("單段影片不需要合併", "render_not_needed", 400);
  }
  if (project.status !== "succeeded") {
    throw new VideoModelError("所有段落完成後才能合併", "not_ready", 409);
  }
  if (project.render && project.render.status !== "failed") return project.render;
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
    `SELECT id, needs_render FROM video_projects
     WHERE id = $1 AND tenant_id = $2 AND ($3::uuid IS NULL OR user_id = $3)`,
    [projectId, tenantId, userId]
  );
  if (!project.rows[0]) throw new VideoModelError("找不到影片專案", "not_found", 404);
  if (project.rows[0].needs_render) return getSucceededRenderBlob(projectId);
  const jobs = await query(
    `SELECT status, result_blob_name, result_mime_type, result_size_bytes
     FROM video_generation_jobs
     WHERE project_id = $1`,
    [projectId]
  );
  if (jobs.rows.length !== 1) return getSucceededRenderBlob(projectId);
  const job = jobs.rows[0];
  return job?.status === "succeeded"
    ? { blobName: job.result_blob_name, contentType: job.result_mime_type || "video/mp4", sizeBytes: job.result_size_bytes }
    : null;
};

const resolveProjectSubtitles = async ({ projectId, tenantId, userId = null }) => {
  const project = await query(
    `SELECT id, storyboard->>'title' AS title FROM video_projects
     WHERE id = $1 AND tenant_id = $2 AND ($3::uuid IS NULL OR user_id = $3)`,
    [projectId, tenantId, userId]
  );
  if (!project.rows[0]) throw new VideoModelError("找不到影片專案", "not_found", 404);
  const subtitle = await getSucceededRenderSubtitleBlob(projectId);
  if (!subtitle) return null;
  return { ...subtitle, title: project.rows[0].title || "subtitles" };
};

module.exports = {
  cancelVideoProject,
  createVideoProject,
  getVideoProjectForUser,
  projectStatus,
  requestVideoRender,
  resolveProjectSubtitles,
  resolveProjectVideo,
  retryVideoProject,
};
