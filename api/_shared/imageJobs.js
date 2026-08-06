const { query, getPool } = require("./db");
const { generateGptImage } = require("./gptImage");
const { uploadGeneratedImage } = require("./blobStorage");

const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 15;
const RETRY_DELAY_SECONDS = 5;

const createImageJob = async ({
  tenantId,
  userId,
  prompt,
  aspectRatio,
  imageSize,
  model,
}) => {
  const result = await query(
    `INSERT INTO image_generation_jobs
       (tenant_id, user_id, model, prompt, aspect_ratio, image_size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, status, model, created_at`,
    [tenantId, userId, model, prompt, aspectRatio || null, imageSize || null]
  );
  return result.rows[0];
};

const getImageJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, model, status, aspect_ratio, image_size, attempts,
            result_blob_name, result_mime_type, error_code, error_message,
            created_at, started_at, completed_at
     FROM image_generation_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     LIMIT 1`,
    [jobId, tenantId, userId]
  );
  return result.rows[0] || null;
};

const claimNextImageJob = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE image_generation_jobs
       SET status = 'failed',
           error_code = 'worker_timeout',
           error_message = '圖片生成工作逾時，請重新提交',
           completed_at = now(),
           updated_at = now()
       WHERE status = 'processing'
         AND locked_at < now() - make_interval(mins => $1)
         AND attempts >= $2`,
      [LOCK_TIMEOUT_MINUTES, MAX_ATTEMPTS]
    );

    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM image_generation_jobs
         WHERE model = 'gpt-image-2'
           AND (
             (status = 'queued' AND available_at <= now())
             OR (
               status = 'processing'
               AND locked_at < now() - make_interval(mins => $1)
               AND attempts < $2
             )
           )
         ORDER BY created_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE image_generation_jobs AS jobs
       SET status = 'processing',
           attempts = jobs.attempts + 1,
           locked_at = now(),
           started_at = COALESCE(jobs.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE jobs.id = candidate.id
       RETURNING jobs.id, jobs.model, jobs.prompt, jobs.aspect_ratio,
                 jobs.image_size, jobs.attempts`,
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

const markImageJobSucceeded = async ({ jobId, blobName, contentType }) => {
  await query(
    `UPDATE image_generation_jobs
     SET status = 'succeeded',
         result_blob_name = $2,
         result_mime_type = $3,
         error_code = NULL,
         error_message = NULL,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, blobName, contentType]
  );
};

const markImageJobFailure = async ({ jobId, attempts, error }) => {
  const shouldRetry = attempts < MAX_ATTEMPTS;
  if (shouldRetry) {
    await query(
      `UPDATE image_generation_jobs
       SET status = 'queued',
           available_at = now() + make_interval(secs => $2),
           locked_at = NULL,
           error_code = 'retrying',
           error_message = '圖片服務暫時忙碌，系統將自動重試',
           updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [jobId, RETRY_DELAY_SECONDS]
    );
    return;
  }

  await query(
    `UPDATE image_generation_jobs
     SET status = 'failed',
         error_code = 'generation_failed',
         error_message = '圖片生成失敗，請稍後重試',
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId]
  );

  console.error("[image-jobs] Job failed permanently:", {
    jobId,
    attempts,
    error: error?.message || String(error),
  });
};

const processNextImageJob = async () => {
  const job = await claimNextImageJob();
  if (!job) return false;

  try {
    const result = await generateGptImage({
      prompt: job.prompt,
      aspectRatio: job.aspect_ratio,
    });
    const stored = await uploadGeneratedImage({
      blobName: `jobs/${job.id}.png`,
      source: result.imageUrl,
    });
    await markImageJobSucceeded({
      jobId: job.id,
      blobName: stored.blobName,
      contentType: stored.contentType,
    });
  } catch (error) {
    await markImageJobFailure({
      jobId: job.id,
      attempts: job.attempts,
      error,
    });
  }

  return true;
};

let workerStarted = false;
let workerBusy = false;

const startImageJobWorker = () => {
  if (workerStarted) return;
  workerStarted = true;

  const pollMs = Number(process.env.IMAGE_JOB_POLL_MS || 2000);
  const run = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      await processNextImageJob();
    } catch (error) {
      console.error("[image-jobs] Worker cycle failed:", error);
    } finally {
      workerBusy = false;
    }
  };

  const timer = setInterval(run, pollMs);
  timer.unref?.();
  run();
};

module.exports = {
  createImageJob,
  getImageJobForUser,
  startImageJobWorker,
};
