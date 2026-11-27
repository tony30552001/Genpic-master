const { query, getPool } = require("./db");
const { getImageJobForUser } = require("./imageJobs");
const { resolveOwnedImageUpload } = require("./imageUploads");
const { VideoModelError, getVideoModelFamily } = require("./videoModelFamilies");
const { VideoRenderError, renderTimeline } = require("./videoRenderClient");

const MAX_ATTEMPTS = 3;
// Longer than one /render call (VIDEO_RENDER_CONCAT_TIMEOUT_MS), so a live
// worker is never treated as lost.
const LOCK_TIMEOUT_MINUTES = 10;
const RENDER_TIMEOUT_MINUTES = 40;
const RETRY_DELAY_SECONDS = 15;

const OUTPUT_DIMENSIONS = Object.freeze({
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
});

const renderSummary = (row) =>
  row
    ? {
        renderId: row.id,
        status: row.status,
        completedAt: row.completed_at,
        hasSubtitles: Boolean(row.subtitle_blob_name),
        ...(row.status === "failed"
          ? {
              error: {
                code: row.error_code || "video_render_failed",
                message: row.error_message || "影片合併失敗，請重新合併",
              },
            }
          : {}),
      }
    : null;

/** The project's newest render, or null when it was never rendered. */
const getLatestVideoRender = async (projectId) => {
  const result = await query(
    `SELECT id, status, subtitle_blob_name, error_code, error_message, completed_at
     FROM video_renders
     WHERE project_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId]
  );
  return renderSummary(result.rows[0]);
};

/** Queues a render unless the project already has one that has not failed. */
const queueVideoRender = async ({ tenantId, userId, projectId }) => {
  await query(
    `INSERT INTO video_renders (tenant_id, user_id, project_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id) WHERE status <> 'failed' DO NOTHING`,
    [tenantId, userId, projectId]
  );
  return getLatestVideoRender(projectId);
};

// Called in the transaction that admits an entirely reused / static-only project
// or finishes a segment. Segment completions are serialized per tenant.
const queueCompletedProjectRender = (client, projectId) =>
  client.query(
    `INSERT INTO video_renders (project_id, tenant_id, user_id)
     SELECT p.id, p.tenant_id, p.user_id
     FROM video_projects p
     WHERE p.id = $1
       AND p.needs_render = true
       AND NOT EXISTS (
         SELECT 1 FROM video_generation_jobs j
         WHERE j.project_id = p.id AND j.status <> 'succeeded'
       )
     ON CONFLICT (project_id) WHERE status <> 'failed' DO NOTHING`,
    [projectId]
  );

const getSucceededRenderBlob = async (projectId) => {
  const result = await query(
    `SELECT result_blob_name, result_size_bytes
     FROM video_renders
     WHERE project_id = $1 AND status = 'succeeded'`,
    [projectId]
  );
  const row = result.rows[0];
  return row ? { blobName: row.result_blob_name, contentType: "video/mp4", sizeBytes: row.result_size_bytes } : null;
};

const getSucceededRenderSubtitleBlob = async (projectId) => {
  const result = await query(
    `SELECT subtitle_blob_name, subtitle_size_bytes
     FROM video_renders
     WHERE project_id = $1 AND status = 'succeeded' AND subtitle_blob_name IS NOT NULL`,
    [projectId]
  );
  const row = result.rows[0];
  return row
    ? {
        blobName: row.subtitle_blob_name,
        contentType: "application/x-subrip; charset=utf-8",
        sizeBytes: row.subtitle_size_bytes,
      }
    : null;
};

const claimNextVideoRender = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE video_renders
       SET status = 'failed', error_code = 'render_timeout',
           error_message = '影片合併逾時，請重新合併',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status IN ('queued', 'processing')
         AND created_at < now() - make_interval(mins => $1)`,
      [RENDER_TIMEOUT_MINUTES]
    );
    await client.query(
      `UPDATE video_renders
       SET status = 'failed', error_code = 'render_lost',
           error_message = '影片合併中斷，請重新合併',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status = 'processing' AND attempts >= $1
         AND locked_at < now() - make_interval(mins => $2)`,
      [MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES]
    );
    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM video_renders
         WHERE (status = 'queued' AND available_at <= now())
            OR (status = 'processing' AND attempts < $1
                AND locked_at < now() - make_interval(mins => $2))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE video_renders AS renders
       SET status = 'processing',
           attempts = renders.attempts + 1,
           lock_version = renders.lock_version + 1,
           locked_at = now(),
           started_at = COALESCE(renders.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE renders.id = candidate.id
       RETURNING renders.*`,
      [MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES]
    );
    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

// Every write after the claim is fenced by lock_version, so a worker whose
// lock expired cannot overwrite the result of the worker that reclaimed it.
const updateByLock = async ({ render, sql, values = [] }) =>
  query(
    `UPDATE video_renders
     SET ${sql}, updated_at = now()
     WHERE id = $1 AND status = 'processing' AND lock_version = $2`,
    [render.id, render.lock_version, ...values]
  );

const markVideoRenderFailure = async ({ render, error }) => {
  const userFacing = error instanceof VideoModelError || error instanceof VideoRenderError;
  // The output path is versioned. Both the render call and a failed
  // transaction publishing its history can safely retry under a fresh claim.
  if ((!userFacing || (error instanceof VideoRenderError && error.retryable)) && render.attempts < MAX_ATTEMPTS) {
    await updateByLock({
      render,
      sql: `status = 'queued', available_at = now() + make_interval(secs => $3),
            locked_at = NULL, error_code = 'retrying',
            error_message = '影片合併服務暫時忙碌，系統將自動重試'`,
      values: [RETRY_DELAY_SECONDS],
    });
    return;
  }
  await updateByLock({
    render,
    sql: `status = 'failed', error_code = $3, error_message = $4,
          locked_at = NULL, completed_at = now()`,
    values: [
      userFacing ? error.code : "video_render_failed",
      userFacing ? error.message : "影片合併失敗，請重新合併",
    ],
  });
  if (!userFacing) {
    console.error("[video-renders] Render failed:", {
      renderId: render.id,
      name: error?.name,
      code: error?.code,
    });
  }
};

const resolveImageShotSource = async ({ shot, tenantId, userId }) => {
  if (shot.uploadId) {
    const upload = await resolveOwnedImageUpload({ uploadId: shot.uploadId, tenantId, userId });
    if (!upload) {
      throw new VideoModelError("靜態圖幕的圖片已過期或無法使用，請重新上傳", "upload_not_found", 404);
    }
    return { upload };
  }
  if (shot.imageJobId) {
    const job = await getImageJobForUser({ jobId: shot.imageJobId, tenantId, userId });
    if (job?.status !== "succeeded" || !job.resultBlobName) {
      throw new VideoModelError("靜態圖幕的圖片版本無法使用，請重新選擇", "source_job_not_found", 404);
    }
    return { blobName: job.resultBlobName };
  }
  throw new VideoModelError("靜態圖幕缺少圖片來源", "invalid_storyboard", 400);
};

const buildRenderPlan = async (projectId) => {
  const projectResult = await query(
    `SELECT p.id, p.tenant_id, p.user_id, p.model_key, p.storyboard,
            p.aspect_ratio, p.generate_audio, p.narration_assets,
            m.family AS model_family
     FROM video_projects p
     LEFT JOIN video_models m ON m.tenant_id = p.tenant_id AND m.model_key = p.model_key
     WHERE p.id = $1`,
    [projectId]
  );
  const project = projectResult.rows[0];
  if (!project) {
    throw new VideoModelError("找不到影片專案", "not_found", 404);
  }

  const jobsResult = await query(
    `SELECT id, segment_index, status, result_blob_name, storyboard
     FROM video_generation_jobs
     WHERE project_id = $1
     ORDER BY segment_index`,
    [projectId]
  );
  const jobs = jobsResult.rows;
  if (jobs.some((row) => row.status !== "succeeded" || !row.result_blob_name)) {
    throw new VideoModelError("影片段落尚未全部完成，無法合併", "segments_not_ready", 409);
  }

  const storyboard = project.storyboard || { global: {}, shots: [] };
  const global = storyboard.global || {};
  const shots = Array.isArray(storyboard.shots) ? storyboard.shots : [];
  const narrationAssets = project.narration_assets && typeof project.narration_assets === "object"
    ? project.narration_assets
    : {};

  let family = null;
  if (project.model_family) {
    try {
      family = getVideoModelFamily(project.model_family);
    } catch {
      family = null;
    }
  }

  const jobByShotId = new Map();
  for (const job of jobs) {
    const segmentShots = Array.isArray(job.storyboard?.shots) ? job.storyboard.shots : [];
    for (const segShot of segmentShots) {
      jobByShotId.set(segShot.id, job);
    }
  }

  const clips = [];
  const emittedJobIds = new Set();
  let narrationCharacters = 0;
  let hasSubtitles = false;

  const narrationEntry = (shotId, offset) => {
    const asset = narrationAssets[shotId];
    if (!asset?.blobName) return null;
    narrationCharacters += Number(asset.characters) || 0;
    const cues = Array.isArray(asset.cues) ? asset.cues : [];
    if (cues.length) hasSubtitles = true;
    return { blobName: asset.blobName, offset, cues };
  };

  for (const shot of shots) {
    if (shot.source === "image") {
      const source = await resolveImageShotSource({
        shot,
        tenantId: project.tenant_id,
        userId: project.user_id,
      });
      const narr = narrationEntry(shot.id, 0);
      const overlays = Array.isArray(shot.onScreenText) && shot.onScreenText.length
        ? [{ start: 0, end: Number(shot.duration) || 3, lines: shot.onScreenText }]
        : [];
      clips.push({
        kind: "image",
        ...source,
        duration: Number(shot.duration) || 3,
        sourceAudio: "mute",
        narrations: narr ? [narr] : [],
        overlays,
      });
      continue;
    }

    const job = jobByShotId.get(shot.id);
    if (!job) {
      throw new VideoModelError("影片段落資料不完整，無法合併", "segments_not_ready", 409);
    }
    if (emittedJobIds.has(job.id)) continue;
    emittedJobIds.add(job.id);

    const segmentShots = Array.isArray(job.storyboard?.shots) ? job.storyboard.shots : [shot];
    const narrations = [];
    const overlays = [];
    let localOffset = 0;
    for (const segShot of segmentShots) {
      const segDuration = Number(segShot.duration) || 0;
      const narr = narrationEntry(segShot.id, localOffset);
      if (narr) narrations.push(narr);
      if (Array.isArray(segShot.onScreenText) && segShot.onScreenText.length) {
        overlays.push({
          start: localOffset,
          end: localOffset + Math.max(segDuration, 0.5),
          lines: segShot.onScreenText,
        });
      }
      localOffset += segDuration;
    }

    let sourceAudio = "keep";
    if (narrations.length > 0) {
      if (family?.supportsAudio) {
        sourceAudio = "mute";
      } else {
        sourceAudio = project.generate_audio ? "duck" : "mute";
      }
    }

    clips.push({
      kind: "video",
      blobName: job.result_blob_name,
      sourceAudio,
      narrations,
      overlays,
    });
  }

  // Fallback for legacy multi-segment projects whose storyboard shots lacked ids.
  if (!clips.length && jobs.length) {
    for (const job of jobs) {
      clips.push({
        kind: "video",
        blobName: job.result_blob_name,
        sourceAudio: "keep",
        narrations: [],
        overlays: [],
      });
    }
  }

  if (!clips.length) {
    throw new VideoModelError("沒有可合併的影片內容", "segments_not_ready", 409);
  }

  const dimensions = OUTPUT_DIMENSIONS[project.aspect_ratio] || OUTPUT_DIMENSIONS["16:9"];
  return {
    width: dimensions.width,
    height: dimensions.height,
    fps: 24,
    transition: global.transition === "fade" ? "fade" : "cut",
    transitionDuration: 0.5,
    burnSubtitles: Boolean(global.subtitles),
    clips,
    hasSubtitles,
    narrationCharacters,
  };
};

const processNextVideoRender = async () => {
  const render = await claimNextVideoRender();
  if (!render) return false;
  try {
    const plan = await buildRenderPlan(render.project_id);
    const outputBlobName = `videos/projects/${render.project_id}/${render.id}-${render.lock_version}.mp4`;
    const subtitleBlobName = plan.hasSubtitles
      ? `videos/projects/${render.project_id}/${render.id}-${render.lock_version}.srt`
      : null;
    const output = await renderTimeline({
      width: plan.width,
      height: plan.height,
      fps: plan.fps,
      transition: plan.transition,
      transitionDuration: plan.transitionDuration,
      burnSubtitles: plan.burnSubtitles,
      clips: plan.clips,
      outputBlobName,
      subtitleBlobName,
    });
    await query(
      `WITH finished AS (
         UPDATE video_renders
         SET status = 'succeeded',
             result_blob_name = $3,
             result_size_bytes = $4,
             result_duration_seconds = $5,
             subtitle_blob_name = $6,
             subtitle_size_bytes = $7,
             narration_characters = $8,
             error_code = NULL,
             error_message = NULL,
             locked_at = NULL,
             completed_at = now(),
             updated_at = now()
         WHERE id = $1 AND status = 'processing' AND lock_version = $2
         RETURNING project_id
       )
       INSERT INTO history (tenant_id, user_id, video_project_id, source, model, user_script, prompt)
       SELECT p.tenant_id, p.user_id, p.id, 'video', p.model_key, p.storyboard->>'title',
         COALESCE(
           (SELECT string_agg(j.prompt, E'\\n\\n' ORDER BY j.segment_index)
              FROM video_generation_jobs j WHERE j.project_id = p.id),
           p.storyboard->>'title'
         )
       FROM finished JOIN video_projects p ON p.id = finished.project_id`,
      [
        render.id,
        render.lock_version,
        output.blobName,
        output.sizeBytes,
        output.durationSeconds,
        output.subtitleBlobName,
        output.subtitleSizeBytes,
        plan.narrationCharacters,
      ]
    );
  } catch (error) {
    await markVideoRenderFailure({ render, error });
  }
  return true;
};

let workerStarted = false;
let workerBusy = false;

// Separate from the video job worker because one render call can take
// minutes and must not delay segment polling.
const startVideoRenderWorker = () => {
  if (workerStarted) return;
  workerStarted = true;
  const pollMs = Number(process.env.VIDEO_RENDER_POLL_MS || 3000);
  const run = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      await processNextVideoRender();
    } catch (error) {
      console.error("[video-renders] Worker cycle failed:", {
        name: error?.name,
        code: error?.code,
      });
    } finally {
      workerBusy = false;
    }
  };
  const timer = setInterval(run, pollMs);
  timer.unref?.();
  run();
};

module.exports = {
  MAX_ATTEMPTS,
  buildRenderPlan,
  getLatestVideoRender,
  getSucceededRenderBlob,
  getSucceededRenderSubtitleBlob,
  processNextVideoRender,
  queueCompletedProjectRender,
  queueVideoRender,
  startVideoRenderWorker,
};
