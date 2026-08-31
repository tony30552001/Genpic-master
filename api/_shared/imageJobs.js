const { query, getPool } = require("./db");
const {
  editGptImage,
  generateGptImage,
  normalizeImageQuality,
} = require("./gptImage");
const { uploadGeneratedImage } = require("./blobStorage");
const {
  downloadOwnedImage,
  resolveOwnedImageUpload,
} = require("./imageUploads");

const MAX_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 15;
const RETRY_DELAY_SECONDS = 5;
const IMAGE_JOB_OPERATIONS = Object.freeze(["generate", "edit"]);

const createImageJob = async ({
  tenantId,
  userId,
  prompt,
  aspectRatio,
  imageSize,
  quality,
  model,
  operation = "generate",
  sourceUploadId = null,
}) => {
  if (!IMAGE_JOB_OPERATIONS.includes(operation)) {
    throw new Error("不支援的圖片工作類型");
  }
  if (
    (operation === "generate" && sourceUploadId) ||
    (operation === "edit" && !sourceUploadId)
  ) {
    throw new Error("圖片工作來源設定無效");
  }

  const result = await query(
    `INSERT INTO image_generation_jobs
       (tenant_id, user_id, model, prompt, aspect_ratio, image_size, quality,
        operation, source_upload_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, status, model, operation, created_at`,
    [
      tenantId,
      userId,
      model,
      prompt,
      aspectRatio || null,
      imageSize || null,
      normalizeImageQuality(quality),
      operation,
      sourceUploadId,
    ]
  );
  return result.rows[0];
};

const getImageJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, model, operation, status, aspect_ratio, image_size, attempts,
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
           error_message = CASE
             WHEN operation = 'edit' THEN '圖片轉換工作逾時，請重新提交'
             ELSE '圖片生成工作逾時，請重新提交'
           END,
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
                 jobs.image_size, jobs.quality, jobs.operation,
                 jobs.source_upload_id, jobs.tenant_id, jobs.user_id,
                 jobs.attempts`,
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

const markImageJobFailure = async ({ jobId, operation, attempts, error }) => {
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

  const isEdit = operation === "edit";
  await query(
    `UPDATE image_generation_jobs
     SET status = 'failed',
         error_code = $2,
         error_message = $3,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [
      jobId,
      isEdit ? "transform_failed" : "generation_failed",
      isEdit ? "圖片轉換失敗，請稍後重試" : "圖片生成失敗，請稍後重試",
    ]
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
    let result;
    if (job.operation === "edit") {
      const upload = await resolveOwnedImageUpload({
        uploadId: job.source_upload_id,
        tenantId: job.tenant_id,
        userId: job.user_id,
      });
      if (!upload) {
        throw new Error("找不到可用的圖片轉換來源");
      }
      const source = await downloadOwnedImage(upload);
      result = await editGptImage({
        imageBase64: source.buffer.toString("base64"),
        mimeType: source.contentType,
        prompt: job.prompt,
        aspectRatio: job.aspect_ratio,
        quality: job.quality,
      });
    } else {
      result = await generateGptImage({
        prompt: job.prompt,
        aspectRatio: job.aspect_ratio,
        quality: job.quality,
      });
    }

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
      operation: job.operation,
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
  processNextImageJob,
  startImageJobWorker,
};
