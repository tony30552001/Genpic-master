const { query, getPool } = require("./db");
const { LlmConfigurationError } = require("./llmModels");
const { VideoModelError } = require("./videoModelFamilies");
const { AGENT_ACTIONS, loadAllowedModel } = require("./videoStoryboardAgent");

// A job is reclaimed only when its worker died; llmRuntime already retries
// model calls, so a failed agent call is final.
const MAX_ATTEMPTS = 2;
// Longer than one agent call including llmRuntime's retries.
const LOCK_TIMEOUT_MINUTES = 6;
const JOB_TIMEOUT_MINUTES = 15;
const RETENTION_HOURS = 24;
const MAX_CONCURRENT = 4;

const jobSummary = (row) => ({
  jobId: row.id,
  action: row.action,
  status: row.status,
  ...(row.status === "succeeded" ? { result: row.result } : {}),
  ...(row.status === "failed"
    ? {
        error: {
          code: row.error_code || "storyboard_agent_failed",
          message: row.error_message || "分鏡 AI 暫時無法回應，請稍後重試",
        },
      }
    : {}),
});

const queueStoryboardJob = async ({ tenantId, userId, action, request }) => {
  const result = await query(
    `INSERT INTO video_storyboard_jobs (tenant_id, user_id, action, request)
     VALUES ($1, $2, $3, $4)
     RETURNING id, action, status`,
    [tenantId, userId, action, JSON.stringify(request)]
  );
  return jobSummary(result.rows[0]);
};

const getStoryboardJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, action, status, result, error_code, error_message
     FROM video_storyboard_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [jobId, tenantId, userId]
  );
  return result.rows[0] ? jobSummary(result.rows[0]) : null;
};

const claimNextStoryboardJob = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM video_storyboard_jobs
       WHERE status IN ('succeeded', 'failed')
         AND completed_at < now() - make_interval(hours => $1)`,
      [RETENTION_HOURS]
    );
    await client.query(
      `UPDATE video_storyboard_jobs
       SET status = 'failed', error_code = 'storyboard_timeout',
           error_message = '分鏡 AI 逾時，請重試',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status IN ('queued', 'processing')
         AND (created_at < now() - make_interval(mins => $1)
              OR (status = 'processing' AND attempts >= $2
                  AND locked_at < now() - make_interval(mins => $3)))`,
      [JOB_TIMEOUT_MINUTES, MAX_ATTEMPTS, LOCK_TIMEOUT_MINUTES]
    );
    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM video_storyboard_jobs
         WHERE status = 'queued'
            OR (status = 'processing' AND attempts < $1
                AND locked_at < now() - make_interval(mins => $2))
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE video_storyboard_jobs AS jobs
       SET status = 'processing',
           attempts = jobs.attempts + 1,
           lock_version = jobs.lock_version + 1,
           locked_at = now(),
           started_at = COALESCE(jobs.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE jobs.id = candidate.id
       RETURNING jobs.*`,
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

// Fenced by lock_version, so a worker whose lock expired cannot overwrite the
// result of the worker that reclaimed the job.
const finishJob = async ({ job, sql, values }) =>
  query(
    `UPDATE video_storyboard_jobs
     SET ${sql}, locked_at = NULL, completed_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'processing' AND lock_version = $2`,
    [job.id, job.lock_version, ...values]
  );

const runStoryboardJob = async (job) => {
  const identity = { tenantId: job.tenant_id, userId: job.user_id };
  try {
    const model = await loadAllowedModel(identity, job.request.modelKey);
    const result = await AGENT_ACTIONS[job.action]({ identity, body: job.request, model });
    await finishJob({
      job,
      sql: "status = 'succeeded', result = $3, error_code = NULL, error_message = NULL",
      values: [JSON.stringify(result)],
    });
  } catch (error) {
    const userFacing = error instanceof VideoModelError || error instanceof LlmConfigurationError;
    if (!userFacing) {
      console.error("[video-storyboard-jobs] Agent failed:", { jobId: job.id, name: error?.name, code: error?.code });
    }
    await finishJob({
      job,
      sql: "status = 'failed', error_code = $3, error_message = $4",
      values: [
        userFacing ? error.code : "storyboard_agent_failed",
        userFacing ? error.message : "分鏡 AI 暫時無法回應，請稍後重試",
      ],
    });
  }
};

let workerStarted = false;
let claiming = false;
let running = 0;

// Several jobs run at once: each one mostly waits on the analysis model.
const startStoryboardJobWorker = () => {
  if (workerStarted) return;
  workerStarted = true;
  const pollMs = Number(process.env.VIDEO_STORYBOARD_JOB_POLL_MS || 1000);
  const run = async () => {
    if (claiming) return;
    claiming = true;
    try {
      while (running < MAX_CONCURRENT) {
        const job = await claimNextStoryboardJob();
        if (!job) break;
        running += 1;
        runStoryboardJob(job)
          .catch((error) => {
            console.error("[video-storyboard-jobs] Job update failed:", { jobId: job.id, name: error?.name, code: error?.code });
          })
          .finally(() => {
            running -= 1;
          });
      }
    } catch (error) {
      console.error("[video-storyboard-jobs] Worker cycle failed:", { name: error?.name, code: error?.code });
    } finally {
      claiming = false;
    }
  };
  const timer = setInterval(run, pollMs);
  timer.unref?.();
  run();
};

module.exports = {
  getStoryboardJobForUser,
  queueStoryboardJob,
  runStoryboardJob,
  startStoryboardJobWorker,
};
