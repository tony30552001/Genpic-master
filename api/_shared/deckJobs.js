const { StorageSharedKeyCredential, BlobServiceClient } = require("@azure/storage-blob");

const { query, getPool } = require("./db");
const { uploadGeneratedBlob } = require("./blobStorage");
const { getOwnedUpload } = require("./uploads");
const { downloadUploadBuffer } = require("./uploadStorage");
const { isUrlAllowed } = require("./urlValidator");
const {
  DocumentConversionError,
  inferMimeType,
  parseDocumentBuffer,
} = require("./documentParser");
const pptMaster = require("./pptMasterClient");
const { authorDeck, generateDesignSystem, generateOutline } = require("./deckAuthor");
const { LlmConfigurationError, resolveRoleModel } = require("./llmModels");
const { ensureModelPolicy } = require("./modelPolicy");
const { generateDeckImages } = require("./deckImages");
const { buildAuthoringSystemPrompt } = require("./svgAuthoringPrompt");
const {
  DECK_STEP_LABELS: STEP_LABELS,
  normalizeImageDensity,
} = require("./deckContract");
const { normalizeRecipeId } = require("./deckRecipes");

const MAX_ATTEMPTS = 2;
/**
 * A 20-page deck runs an outline call, a design-system call, illustrations and
 * then one authoring call per page plus its repair rounds, so the lock has to
 * outlast a worst case that is far longer than the 12-page ceiling assumed.
 */
const LOCK_TIMEOUT_MINUTES = Number(process.env.DECK_JOB_TIMEOUT_MINUTES || 60);
const RETRY_DELAY_SECONDS = 15;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const createDeckJob = async ({
  tenantId,
  userId,
  inputKind,
  topic,
  sourceUploadId,
  sourceDocumentUrl,
  sourceFileName,
  slideCount,
  imageDensity,
  styleId,
  layoutId,
  brandId,
  recipeId,
  briefPurpose,
  briefAudience,
  briefOutcome,
}) => {
  const result = await query(
    `INSERT INTO deck_generation_jobs
       (tenant_id, user_id, input_kind, topic, source_upload_id, source_document_url,
        source_file_name, slide_count, style_id, layout_id, brand_id, image_density,
        recipe_id, brief_purpose, brief_audience, brief_outcome,
        progress_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $8)
     RETURNING id, status, created_at`,
    [
      tenantId,
      userId,
      inputKind,
      topic || null,
      sourceUploadId || null,
      sourceDocumentUrl || null,
      sourceFileName || null,
      slideCount,
      styleId || null,
      layoutId || null,
      brandId || null,
      normalizeImageDensity(imageDensity),
      normalizeRecipeId(recipeId),
      briefPurpose || null,
      briefAudience || null,
      briefOutcome || null,
    ]
  );
  return result.rows[0];
};

const hasUsableUploadExpiry = (upload) => {
  const expiresAt = new Date(upload?.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const resolveDeckSourceUpload = async ({ sourceUploadId, tenantId, userId }) => {
  const canonicalUploadId =
    typeof sourceUploadId === "string" ? sourceUploadId.toLowerCase() : "";
  if (!UUID_PATTERN.test(canonicalUploadId)) {
    throw new Error("Source upload unavailable");
  }

  const upload = await getOwnedUpload({
    uploadId: canonicalUploadId,
    tenantId,
    userId,
    purpose: "document",
    status: "ready",
  });
  if (
    !upload ||
    upload.id !== canonicalUploadId ||
    upload.tenant_id !== tenantId ||
    upload.user_id !== userId ||
    upload.purpose !== "document" ||
    upload.status !== "ready" ||
    !hasUsableUploadExpiry(upload)
  ) {
    throw new Error("Source upload unavailable");
  }
  return upload;
};

const getDeckJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, input_kind, topic, source_file_name, slide_count, image_density,
            style_id, layout_id, brand_id, recipe_id,
            brief_purpose, brief_audience, brief_outcome, deck_title, status, phase,
            progress_current, progress_total, attempts, result_blob_name,
            result_file_name, error_code, error_message,
            created_at, started_at, completed_at
     FROM deck_generation_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     LIMIT 1`,
    [jobId, tenantId, userId]
  );
  return result.rows[0] || null;
};

/** Append one step to the job trace. Never let tracing break generation. */
const recordDeckJobEvent = async ({ jobId, step, status, slideNumber, detail }) => {
  try {
    await query(
      `INSERT INTO deck_job_events (job_id, step, status, slide_number, detail)
       VALUES ($1, $2, $3, $4, $5)`,
      [jobId, step, status, slideNumber ?? null, detail || null]
    );
  } catch (error) {
    console.warn("[deck-jobs] Failed to record job event:", {
      jobId,
      step,
      status,
      message: error.message,
    });
  }
};

const listDeckJobEvents = async ({ jobId }) => {
  const result = await query(
    `SELECT id, step, status, slide_number, detail, created_at
     FROM deck_job_events
     WHERE job_id = $1
     ORDER BY id`,
    [jobId]
  );
  return result.rows;
};

/**
 * Keep the authored SVG so the browser can preview the page while the job is
 * still running. A quality repair rewrites the same page, so `revision` bumps
 * and becomes the client's cache key. Like the event trace, this is
 * best-effort: losing a preview must never break generation.
 */
const saveDeckSlidePreview = async ({ jobId, slideNumber, title, svg }) => {
  try {
    await query(
      `INSERT INTO deck_slide_previews (job_id, slide_number, title, svg)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, slide_number) DO UPDATE
         SET title = EXCLUDED.title,
             svg = EXCLUDED.svg,
             revision = deck_slide_previews.revision + 1,
             updated_at = now()`,
      [jobId, slideNumber, title || null, svg]
    );
  } catch (error) {
    console.warn("[deck-jobs] Failed to save slide preview:", {
      jobId,
      slideNumber,
      message: error.message,
    });
  }
};

const listDeckSlidePreviews = async ({ jobId }) => {
  const result = await query(
    `SELECT slide_number, revision, title
     FROM deck_slide_previews
     WHERE job_id = $1
     ORDER BY slide_number`,
    [jobId]
  );
  return result.rows;
};

const getDeckSlidePreview = async ({ jobId, slideNumber }) => {
  const result = await query(
    `SELECT slide_number, revision, title, svg
     FROM deck_slide_previews
     WHERE job_id = $1 AND slide_number = $2
     LIMIT 1`,
    [jobId, slideNumber]
  );
  return result.rows[0] || null;
};

const claimNextDeckJob = async () => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE deck_generation_jobs
       SET status = 'failed',
           error_code = 'worker_timeout',
           error_message = '簡報生成逾時，請重新提交',
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
         FROM deck_generation_jobs
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
       UPDATE deck_generation_jobs AS jobs
       SET status = 'processing',
           attempts = jobs.attempts + 1,
           locked_at = now(),
           phase = '準備中',
           started_at = COALESCE(jobs.started_at, now()),
           updated_at = now()
       FROM candidate
       WHERE jobs.id = candidate.id
       RETURNING jobs.id, jobs.input_kind, jobs.topic, jobs.source_upload_id,
                 jobs.source_document_url, jobs.source_file_name, jobs.slide_count,
                 jobs.image_density,
                  jobs.style_id, jobs.layout_id, jobs.brand_id, jobs.recipe_id,
                  jobs.brief_purpose, jobs.brief_audience, jobs.brief_outcome,
                  jobs.attempts, jobs.tenant_id, jobs.user_id`,
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

const updateDeckJobProgress = async ({ jobId, phase, current, total }) => {
  await query(
    `UPDATE deck_generation_jobs
     SET phase = COALESCE($2, phase),
         progress_current = COALESCE($3, progress_current),
         progress_total = COALESCE($4, progress_total),
         locked_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, phase ?? null, current ?? null, total ?? null]
  );
};

const markDeckJobSucceeded = async ({ jobId, blobName, fileName, deckTitle, slideCount }) => {
  await query(
    `UPDATE deck_generation_jobs
     SET status = 'succeeded',
         phase = '已完成',
         progress_current = $5,
         progress_total = $5,
         deck_title = $4,
         result_blob_name = $2,
         result_file_name = $3,
         error_code = NULL,
         error_message = NULL,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, blobName, fileName, deckTitle, slideCount]
  );
};

const markDeckJobFailure = async ({ jobId, attempts, error }) => {
  const message = error?.message || "簡報生成失敗，請稍後重試";
  const retryable = !(error instanceof LlmConfigurationError);

  if (retryable && attempts < MAX_ATTEMPTS) {
    await query(
      `UPDATE deck_generation_jobs
       SET status = 'queued',
           available_at = now() + make_interval(secs => $2::int),
           locked_at = NULL,
           phase = '排隊重試中',
           error_code = 'retrying',
           error_message = $3,
           updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [jobId, RETRY_DELAY_SECONDS, message]
    );
    console.warn("[deck-jobs] Job retrying:", { jobId, attempts, message });
    return;
  }

  await query(
    `UPDATE deck_generation_jobs
     SET status = 'failed',
         phase = NULL,
         error_code = $3,
         error_message = $2,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, message, retryable ? "deck_generation_failed" : "llm_not_configured"]
  );

  console.error("[deck-jobs] Job failed permanently:", { jobId, attempts, message });
};

const fetchSourceDocument = async ({ documentUrl, fileName }) => {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  const blobHost = `${account}.blob.core.windows.net`;

  if (account && key && documentUrl.includes(blobHost)) {
    const url = new URL(documentUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      const credential = new StorageSharedKeyCredential(account, key);
      const serviceClient = new BlobServiceClient(
        `https://${account}.blob.core.windows.net`,
        credential
      );
      const blobClient = serviceClient
        .getContainerClient(pathParts[0])
        .getBlobClient(decodeURIComponent(pathParts.slice(1).join("/")));
      const buffer = await blobClient.downloadToBuffer();
      return { buffer, contentType: inferMimeType(fileName || pathParts.at(-1)) };
    }
  }

  if (!isUrlAllowed(documentUrl)) {
    throw new Error("不允許的文件 URL，請確認文件來源是否為合法的 Azure Blob Storage");
  }

  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new Error(`文件下載失敗 (${response.status})`);
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: inferMimeType(fileName || "document.pdf"),
  };
};

/**
 * Extract Markdown from the uploaded source. AnyDoc handles the common office
 * formats; PDFs it cannot convert fall back to the sidecar's PyMuPDF backend.
 */
const extractSourceMarkdown = async ({ documentUrl, fileName, sourceUpload }) => {
  const sourceFileName = sourceUpload?.original_file_name || fileName || "document.pdf";
  let buffer;
  let contentType;

  if (sourceUpload) {
    buffer = await downloadUploadBuffer(sourceUpload);
    const storedContentType = String(sourceUpload.content_type || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    contentType =
      storedContentType && storedContentType !== "application/octet-stream"
        ? storedContentType
        : inferMimeType(sourceFileName);
  } else {
    ({ buffer, contentType } = await fetchSourceDocument({
      documentUrl,
      fileName: sourceFileName,
    }));
  }

  let parsed = null;
  try {
    parsed = await parseDocumentBuffer({
      buffer,
      fileName: sourceFileName,
      mimeType: contentType,
    });
  } catch (error) {
    if (!(error instanceof DocumentConversionError)) throw error;
    parsed = null;
  }

  if (parsed?.kind === "text" && parsed.text.trim()) {
    return parsed.text;
  }

  const converted = await pptMaster.convertSource({
    fileName: sourceFileName,
    buffer,
    contentType,
  });
  const markdown = String(converted?.markdown || "").trim();
  if (!markdown) {
    throw new Error("無法從文件擷取可用內容，請改用其他文件");
  }
  return markdown;
};

const resolveTemplateSpecs = async ({ styleId, layoutId, brandId }) => {
  const requests = [
    styleId ? { kind: "style", templateId: styleId } : null,
    layoutId ? { kind: "layout", templateId: layoutId } : null,
    brandId ? { kind: "brand", templateId: brandId } : null,
  ].filter(Boolean);

  const specs = await Promise.all(
    requests.map((request) => pptMaster.getTemplateSpec(request))
  );
  return specs;
};

const processDeckJob = async (job) => {
  let currentStep = "source";

  /**
   * One reporter for both surfaces: the job row carries the headline phase and
   * page counter, the event log carries the step-by-step trace the UI renders.
   * Per-slide events only move the counter so the headline stays readable.
   */
  const report = async ({ step, status = "running", detail, slideNumber, current, total }) => {
    currentStep = step;
    await updateDeckJobProgress({
      jobId: job.id,
      phase: slideNumber == null ? detail || STEP_LABELS[step] || null : null,
      current,
      total,
    });
    await recordDeckJobEvent({ jobId: job.id, step, status, slideNumber, detail });
  };

  try {
    let sourceMarkdown = null;
    if (job.input_kind === "document") {
      await report({ step: "source", detail: "解析素材", current: 0, total: job.slide_count });
      const sourceUpload = job.source_upload_id
        ? await resolveDeckSourceUpload({
          sourceUploadId: job.source_upload_id,
          tenantId: job.tenant_id,
          userId: job.user_id,
        })
        : null;
      if (!sourceUpload && !job.source_document_url) {
        throw new Error("Source document is unavailable");
      }
      sourceMarkdown = await extractSourceMarkdown({
        documentUrl: sourceUpload ? null : job.source_document_url,
        fileName: sourceUpload?.original_file_name || job.source_file_name,
        sourceUpload,
      });
      await report({
        step: "source",
        status: "succeeded",
        detail: `已讀取 ${sourceUpload?.original_file_name || job.source_file_name || "參考文件"}`,
      });
    } else {
      await report({
        step: "source",
        status: "skipped",
        detail: "直接依主題生成，未使用參考文件",
        current: 0,
        total: job.slide_count,
      });
    }

    await report({ step: "outline", detail: "規劃簡報大綱", current: 0, total: job.slide_count });
    const [llm, fonts, templateSpecs, modelPolicy] = await Promise.all([
      resolveRoleModel(job.tenant_id, "deck_authoring"),
      pptMaster.getFonts(),
      resolveTemplateSpecs({
        styleId: job.style_id,
        layoutId: job.layout_id,
        brandId: job.brand_id,
      }),
      ensureModelPolicy(job.tenant_id),
    ]);

    /**
     * The outline decides structure and content; the design system that
     * follows decides how the whole deck looks. Splitting them keeps each
     * call focused, and lets a failed design system fall back to the default
     * without costing us the outline.
     */
    const brief = {
      purpose: job.brief_purpose,
      audience: job.brief_audience,
      outcome: job.brief_outcome,
    };

    const { outline, synthesizedPrompts } = await generateOutline({
      topic: job.topic,
      sourceMarkdown,
      slideCount: job.slide_count,
      imageDensity: job.image_density,
      templateSpecs,
      recipeId: job.recipe_id,
      brief,
      llm,
    });
    const illustrated = outline.slides.filter((slide) => slide.needs_image).length;
    await report({
      step: "outline",
      status: "succeeded",
      detail: `《${outline.title}》共 ${outline.slides.length} 頁，其中 ${illustrated} 頁配圖`,
      current: 0,
      total: outline.slides.length,
    });

    for (const slideNumber of synthesizedPrompts) {
      await recordDeckJobEvent({
        jobId: job.id,
        step: "outline",
        status: "succeeded",
        slideNumber,
        detail: `第 ${slideNumber} 頁未附配圖描述，已依標題與重點自動補寫`,
      });
    }

    await report({
      step: "design",
      detail: "建立設計系統",
      current: 0,
      total: outline.slides.length,
    });
    const designSystem = await generateDesignSystem({
      outline,
      templateSpecs,
      brief,
      llm,
      onProgress: report,
    });

    const deck = await pptMaster.createDeck({ name: "pixora_deck" });
    try {
      const imagesBySlide = await generateDeckImages({
        deckId: deck.deckId,
        jobId: job.id,
        outline,
        artDirection: designSystem.artDirection,
        model: modelPolicy.defaultModel,
        onProgress: report,
      });

      await authorDeck({
        deckId: deck.deckId,
        outline,
        imagesBySlide,
        llm,
        systemMessage: buildAuthoringSystemPrompt({
          fontFamilies: fonts?.families,
          templateSpecs,
          designSystem,
        }),
        onProgress: report,
        onSlidePreview: ({ slideNumber, title, svg }) =>
          saveDeckSlidePreview({ jobId: job.id, slideNumber, title, svg }),
      });

      await report({
        step: "export",
        detail: "匯出 PowerPoint",
        current: outline.slides.length,
        total: outline.slides.length,
      });
      const pptx = await pptMaster.exportDeck({
        deckId: deck.deckId,
        fileStem: "pixora_deck",
      });

      const blobName = `decks/${job.id}.pptx`;
      await uploadGeneratedBlob({
        blobName,
        buffer: pptx,
        contentType: pptMaster.PPTX_CONTENT_TYPE,
      });
      await report({
        step: "export",
        status: "succeeded",
        detail: `${outline.title}.pptx`,
      });

      await markDeckJobSucceeded({
        jobId: job.id,
        blobName,
        fileName: `${outline.title}.pptx`,
        deckTitle: outline.title,
        slideCount: outline.slides.length,
      });
    } finally {
      await pptMaster
        .deleteDeck({ deckId: deck.deckId })
        .catch((error) =>
          console.warn("[deck-jobs] Failed to clean up deck workspace:", error.message)
        );
    }
  } catch (error) {
    await recordDeckJobEvent({
      jobId: job.id,
      step: currentStep,
      status: "failed",
      detail: error.message,
    });
    throw error;
  }
};

const processNextDeckJob = async () => {
  const job = await claimNextDeckJob();
  if (!job) return false;

  try {
    await processDeckJob(job);
  } catch (error) {
    await markDeckJobFailure({ jobId: job.id, attempts: job.attempts, error });
  }

  return true;
};

let workerStarted = false;
let workerBusy = false;

const startDeckJobWorker = () => {
  if (workerStarted) return;
  if (!pptMaster.isConfigured()) {
    console.warn(
      "[deck-jobs] PPT_MASTER_SERVICE_URL/KEY not configured; deck job worker is disabled"
    );
    return;
  }
  workerStarted = true;

  const pollMs = Number(process.env.DECK_JOB_POLL_MS || 5000);
  const run = async () => {
    if (workerBusy) return;
    workerBusy = true;
    try {
      await processNextDeckJob();
    } catch (error) {
      console.error("[deck-jobs] Worker cycle failed:", error);
    } finally {
      workerBusy = false;
    }
  };

  const timer = setInterval(run, pollMs);
  timer.unref?.();
  run();
};

module.exports = {
  createDeckJob,
  extractSourceMarkdown,
  getDeckJobForUser,
  getDeckSlidePreview,
  listDeckJobEvents,
  listDeckSlidePreviews,
  resolveDeckSourceUpload,
  startDeckJobWorker,
};
