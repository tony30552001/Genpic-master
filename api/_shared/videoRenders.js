const { query, getPool } = require("./db");
const { VideoModelError } = require("./videoModelFamilies");
const { VideoRenderError, concatSegments } = require("./videoRenderClient");

const MAX_ATTEMPTS = 3;
// Longer than one /render call (VIDEO_RENDER_CONCAT_TIMEOUT_MS), so a live
// worker is never treated as lost.
const LOCK_TIMEOUT_MINUTES = 10;
const RENDER_TIMEOUT_MINUTES = 40;
const RETRY_DELAY_SECONDS = 15;

const renderSummary = (row) =>
  row
    ? {
        renderId: row.id,
        status: row.status,
        completedAt: row.completed_at,
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
    `SELECT id, status, error_code, error_message, completed_at
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

// Called in the transaction that admits an entirely reused project or
// finishes a segment. Segment completions are serialized per tenant.
const queueCompletedProjectRender = (client, projectId) => client.query(
  `INSERT INTO video_renders (project_id, tenant_id, user_id)
   SELECT project_id, tenant_id, user_id FROM video_generation_jobs
   WHERE project_id = $1
   GROUP BY project_id, tenant_id, user_id
   HAVING COUNT(*) > 1 AND bool_and(status = 'succeeded')
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

const loadSegmentBlobNames = async (projectId) => {
  const result = await query(
    `SELECT status, result_blob_name
     FROM video_generation_jobs
     WHERE project_id = $1
     ORDER BY segment_index`,
    [projectId]
  );
  if (result.rows.length < 2 || result.rows.some((row) => row.status !== "succeeded" || !row.result_blob_name)) {
    throw new VideoModelError("影片段落尚未全部完成，無法合併", "segments_not_ready", 409);
  }
  return result.rows.map((row) => row.result_blob_name);
};

const processNextVideoRender = async () => {
  const render = await claimNextVideoRender();
  if (!render) return false;
  try {
    const output = await concatSegments({
      segmentBlobNames: await loadSegmentBlobNames(render.project_id),
      outputBlobName: `videos/projects/${render.project_id}/${render.id}-${render.lock_version}.mp4`,
    });
    await query(
      `WITH finished AS (
         UPDATE video_renders SET status = 'succeeded', result_blob_name = $3, result_size_bytes = $4,
           result_duration_seconds = $5, error_code = NULL, error_message = NULL,
           locked_at = NULL, completed_at = now(), updated_at = now()
         WHERE id = $1 AND status = 'processing' AND lock_version = $2
         RETURNING project_id
       )
       INSERT INTO history (tenant_id, user_id, video_project_id, source, model, user_script, prompt)
       SELECT p.tenant_id, p.user_id, p.id, 'video', p.model_key, p.storyboard->>'title',
         (SELECT string_agg(j.prompt, E'\\n\\n' ORDER BY j.segment_index)
            FROM video_generation_jobs j WHERE j.project_id = p.id)
       FROM finished JOIN video_projects p ON p.id = finished.project_id`,
      [render.id, render.lock_version, output.blobName, output.sizeBytes, output.durationSeconds]
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
  getLatestVideoRender,
  getSucceededRenderBlob,
  processNextVideoRender,
  queueCompletedProjectRender,
  queueVideoRender,
  startVideoRenderWorker,
};
