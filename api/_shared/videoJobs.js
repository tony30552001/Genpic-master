const sharp = require("sharp");
const { query, getPool } = require("./db");
const { downloadGeneratedImage, uploadGeneratedStream } = require("./blobStorage");
const { downloadOwnedImage, resolveOwnedImageUpload } = require("./imageUploads");
const { getImageJobForUser } = require("./imageJobs");
const {
  FoundryFalError,
  downloadVideoResult,
  getVideoRequestStatus,
  getVideoResult,
  isTransientVideoError,
  submitVideo,
} = require("./foundryFal");
const {
  VideoModelError,
  buildVideoRequest,
  getVideoModelFamily,
} = require("./videoModelFamilies");
const { resolveVideoModel } = require("./videoModels");
const { ensureVideoSettings } = require("./videoPolicy");
const { compileStoryboard, normalizeStoryboard } = require("./videoStoryboard");
const { VideoRenderError, extractLastFrame } = require("./videoRenderClient");

const MAX_SUBMIT_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 5;
const JOB_TIMEOUT_MINUTES = 30;
const POLL_DELAY_SECONDS = 4;
const RETRY_DELAY_SECONDS = 15;

const expiredElementError = (name) =>
  new VideoModelError(
    `角色「${name}」的參考圖已失效（上傳圖片保留 48 小時），請重新上傳`,
    "upload_not_found",
    404
  );

const countAdmittedToday = async (db, { tenantId, userId }) => {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count FROM video_generation_jobs
     WHERE tenant_id = $1 AND user_id = $2
       AND created_at >= date_trunc('day', now()) AND status <> 'failed'`,
    [tenantId, userId]
  );
  return Number(result.rows[0]?.count || 0);
};

const getVideoJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, model_key, mode, prompt, storyboard, status, phase, attempts,
            duration_seconds, resolution, aspect_ratio, generate_audio,
            provider_request_id, source_upload_id, source_image_job_id,
            end_source_upload_id, end_source_image_job_id,
            result_blob_name, result_mime_type, result_size_bytes, result_duration_seconds,
            error_code, error_message, created_at, started_at, completed_at
     FROM video_generation_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [jobId, tenantId, userId]
  );
  return result.rows[0] || null;
};

const claimNextVideoJob = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    // A chained segment's clock starts when it is first claimed, because it
    // waits for the segments before it.
    await client.query(
      `UPDATE video_generation_jobs
       SET status = 'failed', phase = 'completed',
           error_code = 'worker_timeout',
           error_message = '影片生成工作逾時，請重新提交',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status IN ('queued', 'processing')
         AND COALESCE(started_at, CASE WHEN previous_job_id IS NULL THEN created_at END)
             < now() - make_interval(mins => $1)`,
      [JOB_TIMEOUT_MINUTES]
    );
    await client.query(
      `UPDATE video_generation_jobs
       SET status = 'failed', phase = 'completed',
           error_code = 'submit_state_lost',
           error_message = '送出狀態無法確認，請在確認帳單後重新提交',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status = 'processing' AND phase = 'submitting'
         AND provider_request_id IS NULL
         AND locked_at < now() - make_interval(mins => $1)`,
      [LOCK_TIMEOUT_MINUTES]
    );
    await client.query(
      `UPDATE video_generation_jobs AS jobs
       SET status = 'failed', phase = 'completed',
           error_code = 'previous_segment_failed',
           error_message = '同一支影片的其他段生成失敗，此段已停止',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE jobs.status = 'queued'
         AND EXISTS (
           SELECT 1 FROM video_generation_jobs failed
           WHERE failed.project_id = jobs.project_id AND failed.status = 'failed'
         )`
    );
    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM video_generation_jobs AS waiting
         WHERE
           (
             status = 'queued' AND available_at <= now()
             AND (
               previous_job_id IS NULL
               OR EXISTS (
                 SELECT 1 FROM video_generation_jobs previous
                 WHERE previous.id = waiting.previous_job_id AND previous.status = 'succeeded'
               )
             )
           )
           OR (
             status = 'processing'
             AND phase IN ('polling', 'storing')
             AND next_poll_at <= now()
             AND (locked_at IS NULL OR locked_at < now() - make_interval(mins => $1))
           )
         ORDER BY created_at, segment_index
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       UPDATE video_generation_jobs AS jobs
       SET status = 'processing',
           phase = CASE WHEN jobs.phase = 'queued' THEN 'submitting' ELSE jobs.phase END,
           attempts = jobs.attempts + CASE WHEN jobs.phase = 'queued' THEN 1 ELSE 0 END,
           lock_version = jobs.lock_version + 1,
           locked_at = now(),
           started_at = COALESCE(jobs.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE jobs.id = candidate.id
       RETURNING jobs.*`,
      [LOCK_TIMEOUT_MINUTES]
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

const updateByLock = async ({
  job,
  sql,
  values = [],
}) => query(
  `UPDATE video_generation_jobs
   SET ${sql}, updated_at = now()
   WHERE id = $1 AND status = 'processing' AND lock_version = $2`,
  [job.id, job.lock_version, ...values]
);

const deferVideoJob = async ({
  job,
  seconds,
  phase = "polling",
  message = null,
  errorCode = null,
}) =>
  updateByLock({
    job,
    sql: `phase = '${phase}', next_poll_at = now() + make_interval(secs => $3),
          locked_at = NULL, error_message = $4, error_code = $5`,
    values: [seconds, message, errorCode],
  });

const markVideoSubmitted = async ({ job, requestId }) =>
  updateByLock({
    job,
    sql: `phase = 'polling', provider_request_id = $3, submitted_at = now(),
          next_poll_at = now() + make_interval(secs => 4), locked_at = NULL`,
    values: [requestId],
  });

const markVideoFailure = async ({ job, error }) => {
  const transient =
    isTransientVideoError(error) || (error instanceof VideoRenderError && error.retryable);
  if (transient && job.phase === "submitting" && job.attempts < MAX_SUBMIT_ATTEMPTS) {
    const delay = Math.max(
      RETRY_DELAY_SECONDS,
      Math.ceil((error.retryAfterMs || 0) / 1000)
    );
    await updateByLock({
      job,
      sql: `status = 'queued', phase = 'queued', available_at = now() + make_interval(secs => $3),
            locked_at = NULL, error_code = 'retrying',
            error_message = '影片服務暫時忙碌，系統將自動重試'`,
      values: [delay],
    });
    return;
  }
  if (transient && job.provider_request_id) {
    await deferVideoJob({
      job,
      phase: job.phase === "storing" ? "storing" : "polling",
      seconds: Math.max(RETRY_DELAY_SECONDS, Math.ceil((error.retryAfterMs || 0) / 1000)),
      message: "影片服務暫時忙碌，系統將繼續重試",
      errorCode: "retrying",
    });
    return;
  }
  const userFacing =
    error instanceof VideoModelError ||
    error instanceof FoundryFalError ||
    error instanceof VideoRenderError;
  await updateByLock({
    job,
    sql: `status = 'failed', phase = 'completed', error_code = $3, error_message = $4,
          locked_at = NULL, completed_at = now()`,
    values: [
      userFacing ? error.code : "video_generation_failed",
      userFacing ? error.message : "影片生成失敗，請稍後重試",
    ],
  });
  if (!userFacing) {
    console.error("[video-jobs] Job failed:", {
      jobId: job.id,
      name: error?.name,
      code: error?.code,
    });
  }
};

const getRemainingQuota = async ({ tenantId, userId }) => {
  const [settings, admitted] = await Promise.all([
    ensureVideoSettings(tenantId),
    countAdmittedToday({ query }, { tenantId, userId }),
  ]);
  return Math.max(0, settings.dailyQuotaPerUser - admitted);
};

// A chained segment starts from the previous segment's last frame.
const loadVideoFrameDataUrl = async (job) => {
  if (job.previous_job_id) {
    const previous = await query(
      `SELECT last_frame_blob_name FROM video_generation_jobs
       WHERE id = $1 AND status = 'succeeded'`,
      [job.previous_job_id]
    );
    const blobName = previous.rows[0]?.last_frame_blob_name;
    if (!blobName) {
      throw new VideoModelError("找不到上一段影片的最後一格畫面", "previous_frame_missing", 409);
    }
    return toJpegDataUrl(await downloadGeneratedImage({ blobName }), 2048);
  }
  return loadOwnedImageDataUrl({
    uploadId: job.source_upload_id,
    imageJobId: job.source_image_job_id,
    job,
  });
};

const ELEMENT_IMAGE_SIZE = 1024;

const loadElementImages = async (job, elements) => {
  const images = [];
  for (const element of elements) {
    const urls = [];
    for (const uploadId of element.uploadIds) {
      const upload = await resolveOwnedImageUpload({
        uploadId,
        tenantId: job.tenant_id,
        userId: job.user_id,
      });
      if (!upload) throw expiredElementError(element.name);
      urls.push(await toJpegDataUrl((await downloadOwnedImage(upload)).buffer, ELEMENT_IMAGE_SIZE));
    }
    images.push(urls);
  }
  return images;
};

const toJpegDataUrl = async (buffer, maxSize) => {
  const jpeg = await sharp(buffer)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
};

const loadOwnedImageDataUrl = async ({ uploadId, imageJobId, job }) => {
  let source;
  if (uploadId) {
    const upload = await resolveOwnedImageUpload({
      uploadId,
      tenantId: job.tenant_id,
      userId: job.user_id,
    });
    if (!upload) throw new VideoModelError("找不到可用的首影格上傳", "upload_not_found", 404);
    source = await downloadOwnedImage(upload);
  } else if (imageJobId) {
    const imageJob = await getImageJobForUser({
      jobId: imageJobId,
      tenantId: job.tenant_id,
      userId: job.user_id,
    });
    if (imageJob?.status !== "succeeded") {
      throw new VideoModelError("找不到可用的圖片版本", "source_job_not_found", 404);
    }
    source = { buffer: await downloadGeneratedImage({ blobName: imageJob.result_blob_name }) };
  } else throw new VideoModelError("找不到可用的圖片來源", "source_job_not_found", 404);
  return toJpegDataUrl(source.buffer, 2048);
};

const assertSubmitCapacity = async (job, settings) => {
  const recent = await query(
    `SELECT COUNT(*)::int AS count FROM video_generation_jobs
     WHERE tenant_id = $1 AND model_key = $2
       AND submitted_at >= now() - interval '1 minute'`,
    [job.tenant_id, job.model_key]
  );
  if (Number(recent.rows[0]?.count || 0) >= settings.submitsPerMinute) {
    const error = new FoundryFalError(
      "影片模型送出節流中",
      "provider_rate_limited",
      429,
      { retryable: true, retryAfterMs: 15_000 }
    );
    throw error;
  }
};

/**
 * Copies the provider's video into storage, then, when a chained segment
 * waits on this job, extracts its last frame before marking it succeeded.
 * The stored blob is recorded first so a retried render step does not
 * download the video again.
 */
const storeVideoResult = async (job, model) => {
  let videoBlobName = job.result_blob_name;
  if (!videoBlobName) {
    const family = getVideoModelFamily(model.family);
    const result = await getVideoResult({
      config: model,
      familyRoute: family.route,
      requestId: job.provider_request_id,
    });
    const download = await downloadVideoResult({ config: model, result });
    const stored = await uploadGeneratedStream({
      blobName: `videos/jobs/${job.id}/${job.lock_version}.mp4`,
      stream: download.stream,
      contentType: "video/mp4",
      contentLength: download.size,
    });
    const recorded = await updateByLock({
      job,
      sql: "result_blob_name = $3, result_mime_type = $4, result_size_bytes = $5",
      values: [stored.blobName, stored.contentType, stored.size],
    });
    if (!recorded.rowCount) return;
    videoBlobName = stored.blobName;
  }
  const successor = await query(
    "SELECT 1 FROM video_generation_jobs WHERE previous_job_id = $1 LIMIT 1",
    [job.id]
  );
  const lastFrame = successor.rows.length
    ? await extractLastFrame({
        videoBlobName,
        frameBlobName: `videos/jobs/${job.id}/${job.lock_version}-last.png`,
      })
    : null;
  await updateByLock({
    job,
    sql: `status = 'succeeded', phase = 'completed', last_frame_blob_name = $3,
          error_code = NULL, error_message = NULL, locked_at = NULL, completed_at = now()`,
    values: [lastFrame?.blobName || null],
  });
};

const processNextVideoJob = async () => {
  const job = await claimNextVideoJob();
  if (!job) return false;
  try {
    const model = await resolveVideoModel({
      tenantId: job.tenant_id,
      modelKey: job.model_key,
    });
    if (job.phase === "submitting") {
      await assertSubmitCapacity(job, await ensureVideoSettings(job.tenant_id));
      const imageDataUrl = job.mode === "i2v" ? await loadVideoFrameDataUrl(job) : null;
      const endImageDataUrl =
        job.mode === "i2v" && (job.end_source_upload_id || job.end_source_image_job_id)
          ? await loadOwnedImageDataUrl({
              uploadId: job.end_source_upload_id,
              imageJobId: job.end_source_image_job_id,
              job,
            })
          : null;
      const compiled = compileStoryboard(model.family, normalizeStoryboard(job.storyboard), { mode: job.mode });
      const request = buildVideoRequest({
        model,
        compiled,
        options: {
          durationSeconds: job.duration_seconds,
          resolution: job.resolution,
          aspectRatio: job.aspect_ratio,
          generateAudio: job.generate_audio,
        },
        mode: job.mode,
        imageDataUrl,
        endImageDataUrl,
        elementImages: await loadElementImages(job, compiled.elements),
      });
      const requestId = await submitVideo({
        config: model,
        path: request.path,
        body: request.body,
      });
      await markVideoSubmitted({ job, requestId });
      return true;
    }

    if (job.phase === "storing") {
      await storeVideoResult(job, model);
      return true;
    }

    const status = await getVideoRequestStatus({
      config: model,
      familyRoute: getVideoModelFamily(model.family).route,
      requestId: job.provider_request_id,
    });
    if (status !== "COMPLETED") {
      await deferVideoJob({ job, seconds: POLL_DELAY_SECONDS });
      return true;
    }
    await updateByLock({
      job,
      sql: "phase = 'storing', next_poll_at = now(), locked_at = now()",
    });
    const storingJob = { ...job, phase: "storing" };
    await storeVideoResult(storingJob, model);
  } catch (error) {
    await markVideoFailure({ job, error });
  }
  return true;
};

let workerStarted = false;
let workerBusy = false;

const startVideoJobWorker = () => {
  if (workerStarted) return;
  workerStarted = true;
  const pollMs = Number(process.env.VIDEO_JOB_POLL_MS || 2000);
  const run = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      await processNextVideoJob();
    } catch (error) {
      console.error("[video-jobs] Worker cycle failed:", {
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
  countAdmittedToday,
  expiredElementError,
  getRemainingQuota,
  getVideoJobForUser,
  processNextVideoJob,
  startVideoJobWorker,
};
