const { query, getPool } = require("./db");

const MAX_ATTEMPTS = 2;
const LOCK_TIMEOUT_MINUTES = 15;
const RETRY_DELAY_SECONDS = 15;

const createDocumentAnalysisJob = async ({
  tenantId,
  userId,
  sourceUploadId,
  sceneCount = "auto",
}) => {
  const result = await query(
    `INSERT INTO document_analysis_jobs
       (tenant_id, user_id, source_upload_id, scene_count)
     VALUES ($1, $2, $3, $4)
     RETURNING id, status, created_at`,
    [tenantId, userId, sourceUploadId, sceneCount || "auto"]
  );
  return result.rows[0];
};

const getDocumentAnalysisJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, tenant_id, user_id, source_upload_id, scene_count,
            status, attempts, result, error_code, error_message,
            created_at, started_at, completed_at
     FROM document_analysis_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     LIMIT 1`,
    [jobId, tenantId, userId]
  );
  return result.rows[0] || null;
};

const claimNextDocumentAnalysisJob = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE document_analysis_jobs
       SET status = 'failed',
           error_code = 'worker_timeout',
           error_message = '文件分析工作逾時，請重新提交',
           completed_at = now(),
           updated_at = now()
       WHERE status = 'processing'
         AND locked_at < now() - make_interval(mins => $1::int)
         AND attempts >= $2`,
      [LOCK_TIMEOUT_MINUTES, MAX_ATTEMPTS]
    );

    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM document_analysis_jobs
         WHERE (
             (status = 'queued' AND available_at <= now())
             OR (
               status = 'processing'
               AND locked_at < now() - make_interval(mins => $1::int)
               AND attempts < $2
             )
           )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE document_analysis_jobs AS jobs
       SET status = 'processing',
           attempts = jobs.attempts + 1,
           locked_at = now(),
           started_at = COALESCE(jobs.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE jobs.id = candidate.id
       RETURNING jobs.id, jobs.tenant_id, jobs.user_id,
                 jobs.source_upload_id, jobs.scene_count, jobs.attempts`,
      [LOCK_TIMEOUT_MINUTES, MAX_ATTEMPTS]
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

const markDocumentAnalysisJobSucceeded = async ({ jobId, result }) => {
  await query(
    `UPDATE document_analysis_jobs
     SET status = 'succeeded',
         result = $2::jsonb,
         error_code = NULL,
         error_message = NULL,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, JSON.stringify(result || {})]
  );
};

const markDocumentAnalysisJobFailure = async ({ jobId, error }) => {
  const code = error?.code || "analysis_failed";
  const message = error?.message || "文件分析失敗，請稍後重試";
  await query(
    `UPDATE document_analysis_jobs
     SET status = 'failed',
         error_code = $2,
         error_message = $3,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, code, message]
  );
};

const markDocumentAnalysisJobRetry = async ({ jobId, error }) => {
  await query(
    `UPDATE document_analysis_jobs
     SET status = 'queued',
         available_at = now() + make_interval(secs => $2::int),
         locked_at = NULL,
         error_code = 'retrying',
         error_message = $3,
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, RETRY_DELAY_SECONDS, error?.message || "文件分析暫時忙碌，將自動重試"]
  );
};

const processNextDocumentAnalysisJob = async ({ analyze } = {}) => {
  if (typeof analyze !== "function") {
    throw new TypeError("Document analysis worker requires an analyze function");
  }

  const job = await claimNextDocumentAnalysisJob();
  if (!job) return false;

  try {
    const result = await analyze({
      uploadId: job.source_upload_id,
      sceneCount: job.scene_count,
      owner: {
        tenantId: job.tenant_id,
        userId: job.user_id,
      },
    });
    await markDocumentAnalysisJobSucceeded({ jobId: job.id, result });
  } catch (error) {
    if (job.attempts < MAX_ATTEMPTS) {
      await markDocumentAnalysisJobRetry({ jobId: job.id, error });
    } else {
      await markDocumentAnalysisJobFailure({ jobId: job.id, error });
    }
    console.error("[document-analysis-jobs] Job failed:", {
      jobId: job.id,
      attempts: job.attempts,
      error: error?.message || String(error),
    });
  }

  return true;
};

let workerStarted = false;
let workerBusy = false;

const startDocumentAnalysisWorker = ({ analyze, pollMs } = {}) => {
  if (workerStarted) return;
  if (typeof analyze !== "function") {
    throw new TypeError("Document analysis worker requires an analyze function");
  }
  workerStarted = true;

  const intervalMs = Number(pollMs || process.env.DOCUMENT_ANALYSIS_JOB_POLL_MS || 2000);
  const run = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      await processNextDocumentAnalysisJob({ analyze });
    } catch (error) {
      console.error("[document-analysis-jobs] Worker cycle failed:", error);
    } finally {
      workerBusy = false;
    }
  };

  const timer = setInterval(run, intervalMs);
  timer.unref?.();
  run();
};

module.exports = {
  MAX_ATTEMPTS,
  createDocumentAnalysisJob,
  getDocumentAnalysisJobForUser,
  claimNextDocumentAnalysisJob,
  markDocumentAnalysisJobSucceeded,
  markDocumentAnalysisJobFailure,
  markDocumentAnalysisJobRetry,
  processNextDocumentAnalysisJob,
  startDocumentAnalysisWorker,
};
