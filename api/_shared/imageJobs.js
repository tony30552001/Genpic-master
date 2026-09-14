const { query, getPool } = require("./db");
const {
  editGptImage,
  generateGptImage,
} = require("./gptImage");
const { ImageModelError, isTransientImageError, validateImageQuality } = require("./imageModelConfig");
const { resolveImageModel, withImageModelTransaction } = require("./imageModels");
const { ensureModelPolicy } = require("./modelPolicy");
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
    throw new ImageModelError("不支援的圖片工作類型");
  }
  if (
    (operation === "generate" && sourceUploadId) ||
    (operation === "edit" && !sourceUploadId)
  ) {
    throw new ImageModelError("圖片工作來源設定無效");
  }

  return withImageModelTransaction(tenantId, async (client) => {
    let selectedModel = model;
    if (model === undefined) {
      const policy = await ensureModelPolicy(tenantId, client);
      selectedModel = policy.defaultModel;
      if (!selectedModel || !policy.allowedModels.includes(selectedModel)) {
        throw new ImageModelError(
          "尚未設定可用的圖片模型，請聯絡管理員", "image_model_not_configured", 503
        );
      }
    }
    const config = await resolveImageModel({ tenantId, modelKey: selectedModel, client });
    const selectedQuality = validateImageQuality(config, quality);
    const result = await client.query(
      `INSERT INTO image_generation_jobs
       (tenant_id, user_id, model, prompt, aspect_ratio, image_size, quality,
        operation, source_upload_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, status, model, operation, created_at`,
      [
        tenantId,
        userId,
        selectedModel,
        prompt,
        aspectRatio || null,
        imageSize || null,
        selectedQuality,
        operation,
        sourceUploadId,
      ]
    );
    return result.rows[0];
  });
};

const getImageJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, model, prompt, operation, status, aspect_ratio, image_size, attempts,
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
         WHERE (
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

const markImageJobSucceeded = async ({ jobId, attempts, blobName, contentType }) => {
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
     WHERE id = $1 AND status = 'processing' AND attempts = $4`,
    [jobId, blobName, contentType, attempts]
  );
};

const markImageJobFailure = async ({ jobId, operation, attempts, error }) => {
  const transient = isTransientImageError(error);
  const shouldRetry = transient && attempts < MAX_ATTEMPTS;
  if (shouldRetry) {
    await query(
      `UPDATE image_generation_jobs
       SET status = 'queued',
           available_at = now() + make_interval(secs => $2),
           locked_at = NULL,
           error_code = 'retrying',
           error_message = '圖片服務暫時忙碌，系統將自動重試',
           updated_at = now()
       WHERE id = $1 AND status = 'processing' AND attempts = $3`,
      [jobId, RETRY_DELAY_SECONDS, attempts]
    );
    return;
  }

  const isEdit = operation === "edit";
  const errorCode = error instanceof ImageModelError ? error.code :
    (isEdit ? "transform_failed" : "generation_failed");
  await query(
    `UPDATE image_generation_jobs
     SET status = 'failed',
         error_code = $2,
         error_message = $3,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing' AND attempts = $4`,
    [
      jobId,
      errorCode,
      error instanceof ImageModelError ? error.message :
        (isEdit ? "圖片轉換失敗，請稍後重試" : "圖片生成失敗，請稍後重試"),
      attempts,
    ]
  );

  console.error("[image-jobs] Job failed permanently:", {
    jobId,
    attempts,
    code: transient ? "transient_io_exhausted" : errorCode,
    status: Number.isInteger(error?.statusCode ?? error?.status)
      ? (error.statusCode ?? error.status) : undefined,
  });
};

const processNextImageJob = async () => {
  const job = await claimNextImageJob();
  if (!job) return false;

  try {
    const config = await resolveImageModel({
      tenantId: job.tenant_id,
      modelKey: job.model,
    });
    validateImageQuality(config, job.quality);
    let result;
    if (job.operation === "edit") {
      const upload = await resolveOwnedImageUpload({
        uploadId: job.source_upload_id,
        tenantId: job.tenant_id,
        userId: job.user_id,
      });
      if (!upload) {
        throw new ImageModelError("找不到可用的圖片轉換來源", "upload_not_found", 404);
      }
      const source = await downloadOwnedImage(upload);
      result = await editGptImage({
        config,
        imageBase64: source.buffer.toString("base64"),
        mimeType: source.contentType,
        prompt: job.prompt,
        aspectRatio: job.aspect_ratio,
        quality: job.quality,
      });
    } else if (job.operation === "generate") {
      result = await generateGptImage({
        config,
        prompt: job.prompt,
        aspectRatio: job.aspect_ratio,
        quality: job.quality,
      });
    } else {
      throw new ImageModelError("不支援的圖片工作類型");
    }

    const stored = await uploadGeneratedImage({
      // Stale workers must not overwrite the winning attempt's image.
      blobName: `jobs/${job.id}/${job.attempts}.png`,
      source: result.imageUrl,
    });
    await markImageJobSucceeded({
      jobId: job.id,
      attempts: job.attempts,
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
      console.error("[image-jobs] Worker cycle failed:", {
        code: isTransientImageError(error) ? "transient_io_error" : "worker_cycle_failed",
        status: Number.isInteger(error?.statusCode ?? error?.status)
          ? (error.statusCode ?? error.status) : undefined,
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
  createImageJob,
  getImageJobForUser,
  processNextImageJob,
  startImageJobWorker,
};
