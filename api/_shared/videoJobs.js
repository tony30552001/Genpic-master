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
  validateVideoOptions,
} = require("./videoModelFamilies");
const {
  resolveVideoModel,
  withVideoModelTransaction,
} = require("./videoModels");
const { ensureVideoSettings } = require("./videoPolicy");

const MAX_SUBMIT_ATTEMPTS = 3;
const LOCK_TIMEOUT_MINUTES = 5;
const JOB_TIMEOUT_MINUTES = 30;
const POLL_DELAY_SECONDS = 4;
const RETRY_DELAY_SECONDS = 15;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUuid = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const assertSource = (sourceCount, mode) => {
  if ((mode === "t2v" && sourceCount !== 0) || (mode === "i2v" && sourceCount !== 1)) {
    throw new VideoModelError("影片生成來源設定無效");
  }
};

const assertEnabledUser = async ({ client, tenantId, userId }) => {
  const result = await client.query(
    "SELECT video_enabled FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true",
    [userId, tenantId]
  );
  if (!result.rows[0]?.video_enabled) {
    throw new VideoModelError("此帳號尚未開放影片創作，請聯絡管理員", "video_disabled", 403);
  }
};

const assertOwnedSource = async ({
  client,
  mode,
  sourceUploadId,
  sourceImageJobId,
  endSourceUploadId,
  endSourceImageJobId,
  tenantId,
  userId,
}) => {
  const sources = [sourceUploadId, sourceImageJobId].filter(Boolean);
  assertSource(sources.length, mode);
  if (sourceUploadId) {
    const upload = await resolveOwnedImageUpload({ uploadId: sourceUploadId, tenantId, userId });
    if (!upload) throw new VideoModelError("找不到可用的首影格上傳", "upload_not_found", 404);
  }
  if (sourceImageJobId) {
    const job = await getImageJobForUser({
      jobId: sourceImageJobId,
      tenantId,
      userId,
    });
    if (job?.status !== "succeeded") {
      throw new VideoModelError("找不到可用的圖片版本", "source_job_not_found", 404);
    }
  }
  const endSources = [endSourceUploadId, endSourceImageJobId].filter(Boolean);
  if (endSources.length > 1 || (endSources.length && mode !== "i2v")) {
    throw new VideoModelError("尾影格來源設定無效");
  }
  if (
    endSourceUploadId &&
    !(await resolveOwnedImageUpload({ uploadId: endSourceUploadId, tenantId, userId }))
  ) {
    throw new VideoModelError("找不到可用的尾影格上傳", "upload_not_found", 404);
  }
  if (endSourceImageJobId) {
    const endJob = await getImageJobForUser({
      jobId: endSourceImageJobId,
      tenantId,
      userId,
    });
    if (endJob?.status !== "succeeded") {
      throw new VideoModelError("找不到可用的尾影格圖片版本", "source_job_not_found", 404);
    }
  }
};

const createVideoJob = async ({
  tenantId,
  userId,
  modelKey,
  prompt,
  originalPrompt,
  mode = "t2v",
  durationSeconds = 5,
  resolution,
  aspectRatio = "16:9",
  generateAudio = false,
  sourceUploadId = null,
  sourceImageJobId = null,
  endSourceUploadId = null,
  endSourceImageJobId = null,
  bypassQuota = false,
  skipAdmission = false,
}) => {
  const canonicalPrompt = typeof prompt === "string" ? prompt.trim() : "";
  if (!canonicalPrompt || canonicalPrompt.length > 20_000) {
    throw new VideoModelError("影片描述必須是 1 至 20000 字元的文字");
  }
  const sourceIds = {
    sourceUploadId: normalizeUuid(sourceUploadId),
    sourceImageJobId: normalizeUuid(sourceImageJobId),
    endSourceUploadId: normalizeUuid(endSourceUploadId),
    endSourceImageJobId: normalizeUuid(endSourceImageJobId),
  };
  const primarySourceCount = [
    sourceIds.sourceUploadId,
    sourceIds.sourceImageJobId,
  ].filter(Boolean).length;
  assertSource(primarySourceCount, mode);
  if (
    (sourceUploadId && !sourceIds.sourceUploadId) ||
    (sourceImageJobId && !sourceIds.sourceImageJobId) ||
    (endSourceUploadId && !sourceIds.endSourceUploadId) ||
    (endSourceImageJobId && !sourceIds.endSourceImageJobId)
  ) {
    throw new VideoModelError("來源識別碼格式無效");
  }

  return withVideoModelTransaction(tenantId, async (client) => {
    if (!skipAdmission) await assertEnabledUser({ client, tenantId, userId });
    const settings = await ensureVideoSettings(tenantId, client);
    if (!skipAdmission && !settings.allowedModels.includes(modelKey)) {
      throw new VideoModelError("此影片模型尚未開放給使用者", "video_model_not_allowed", 403);
    }
    const model = await resolveVideoModel({ tenantId, modelKey, client });
    const options = validateVideoOptions({
      model,
      mode,
      durationSeconds,
      resolution,
      aspectRatio,
      generateAudio,
    });
    await assertOwnedSource({
      client,
      mode,
      ...sourceIds,
      tenantId,
      userId,
    });
    if (!bypassQuota && !skipAdmission) {
      const admitted = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM video_generation_jobs
         WHERE tenant_id = $1 AND user_id = $2
           AND created_at >= date_trunc('day', now())
           AND status <> 'failed'`,
        [tenantId, userId]
      );
      if (Number(admitted.rows[0]?.count || 0) >= settings.dailyQuotaPerUser) {
        throw new VideoModelError("今日影片額度已用完，請明天再試", "video_quota_exceeded", 429);
      }
    }
    const inserted = await client.query(
      `INSERT INTO video_generation_jobs
       (tenant_id, user_id, model_key, mode, prompt, original_prompt, duration_seconds,
        resolution, aspect_ratio, generate_audio, source_upload_id, source_image_job_id,
        end_source_upload_id, end_source_image_job_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING id, status, phase, model_key, created_at`,
      [
        tenantId, userId, modelKey, mode, canonicalPrompt,
        String(originalPrompt || prompt).trim().slice(0, 20_000),
        options.durationSeconds, options.resolution, options.aspectRatio,
        options.generateAudio, sourceIds.sourceUploadId, sourceIds.sourceImageJobId,
        sourceIds.endSourceUploadId, sourceIds.endSourceImageJobId,
      ]
    );
    return inserted.rows[0];
  });
};

const getVideoJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, model_key, mode, prompt, original_prompt, status, phase, attempts,
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
    await client.query(
      `UPDATE video_generation_jobs
       SET status = 'failed', phase = 'completed',
           error_code = 'worker_timeout',
           error_message = '影片生成工作逾時，請重新提交',
           locked_at = NULL, completed_at = now(), updated_at = now()
       WHERE status IN ('queued', 'processing')
         AND created_at < now() - make_interval(mins => $1)`,
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
    const result = await client.query(
      `WITH candidate AS (
         SELECT id
         FROM video_generation_jobs
         WHERE
           (status = 'queued' AND available_at <= now())
           OR (
             status = 'processing'
             AND phase IN ('polling', 'storing')
             AND next_poll_at <= now()
             AND (locked_at IS NULL OR locked_at < now() - make_interval(mins => $1))
           )
         ORDER BY created_at
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
  const transient = isTransientVideoError(error);
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
  const userFacing = error instanceof VideoModelError || error instanceof FoundryFalError;
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
    query(
      `SELECT COUNT(*)::int AS count FROM video_generation_jobs
       WHERE tenant_id = $1 AND user_id = $2
         AND created_at >= date_trunc('day', now()) AND status <> 'failed'`,
      [tenantId, userId]
    ),
  ]);
  return Math.max(0, settings.dailyQuotaPerUser - Number(admitted.rows[0]?.count || 0));
};

const loadVideoFrameDataUrl = async (job) => {
  return loadOwnedImageDataUrl({
    uploadId: job.source_upload_id,
    imageJobId: job.source_image_job_id,
    job,
  });
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
  const jpeg = await sharp(source.buffer)
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 86 })
    .toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
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

const storeVideoResult = async (job, model) => {
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
  await updateByLock({
    job,
    sql: `status = 'succeeded', phase = 'completed', result_blob_name = $3,
          result_mime_type = $4, result_size_bytes = $5,
          error_code = NULL, error_message = NULL, locked_at = NULL, completed_at = now()`,
    values: [stored.blobName, stored.contentType, stored.size],
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
      const request = buildVideoRequest({
        model,
        prompt: job.prompt,
        options: {
          durationSeconds: job.duration_seconds,
          resolution: job.resolution,
          aspectRatio: job.aspect_ratio,
          generateAudio: job.generate_audio,
        },
        mode: job.mode,
        imageDataUrl,
        endImageDataUrl,
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
  createVideoJob,
  getRemainingQuota,
  getVideoJobForUser,
  processNextVideoJob,
  startVideoJobWorker,
};
