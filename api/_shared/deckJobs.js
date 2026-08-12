const { StorageSharedKeyCredential, BlobServiceClient } = require("@azure/storage-blob");

const { query, getPool } = require("./db");
const { uploadGeneratedBlob } = require("./blobStorage");
const { isUrlAllowed } = require("./urlValidator");
const {
  DocumentConversionError,
  inferMimeType,
  parseDocumentBuffer,
} = require("./documentParser");
const pptMaster = require("./pptMasterClient");
const { authorDeck, generateOutline } = require("./deckAuthor");
const { generateDeckImages } = require("./deckImages");
const { buildAuthoringSystemPrompt } = require("./svgAuthoringPrompt");

const MAX_ATTEMPTS = 2;
const LOCK_TIMEOUT_MINUTES = Number(process.env.DECK_JOB_TIMEOUT_MINUTES || 40);
const RETRY_DELAY_SECONDS = 15;

const createDeckJob = async ({
  tenantId,
  userId,
  inputKind,
  topic,
  sourceDocumentUrl,
  sourceFileName,
  slideCount,
  styleId,
  layoutId,
  brandId,
}) => {
  const result = await query(
    `INSERT INTO deck_generation_jobs
       (tenant_id, user_id, input_kind, topic, source_document_url, source_file_name,
        slide_count, style_id, layout_id, brand_id, progress_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $7)
     RETURNING id, status, created_at`,
    [
      tenantId,
      userId,
      inputKind,
      topic || null,
      sourceDocumentUrl || null,
      sourceFileName || null,
      slideCount,
      styleId || null,
      layoutId || null,
      brandId || null,
    ]
  );
  return result.rows[0];
};

const getDeckJobForUser = async ({ jobId, tenantId, userId }) => {
  const result = await query(
    `SELECT id, input_kind, topic, source_file_name, slide_count, style_id, layout_id,
            brand_id, deck_title, status, phase, progress_current, progress_total,
            attempts, result_blob_name, result_file_name, error_code, error_message,
            created_at, started_at, completed_at
     FROM deck_generation_jobs
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3
     LIMIT 1`,
    [jobId, tenantId, userId]
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
       RETURNING jobs.id, jobs.input_kind, jobs.topic, jobs.source_document_url,
                 jobs.source_file_name, jobs.slide_count, jobs.style_id,
                 jobs.layout_id, jobs.brand_id, jobs.attempts`,
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
     SET phase = $2,
         progress_current = COALESCE($3, progress_current),
         progress_total = COALESCE($4, progress_total),
         locked_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, phase, current ?? null, total ?? null]
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

  if (attempts < MAX_ATTEMPTS) {
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
         error_code = 'deck_generation_failed',
         error_message = $2,
         locked_at = NULL,
         completed_at = now(),
         updated_at = now()
     WHERE id = $1 AND status = 'processing'`,
    [jobId, message]
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
const extractSourceMarkdown = async ({ documentUrl, fileName }) => {
  const { buffer, contentType } = await fetchSourceDocument({ documentUrl, fileName });

  let parsed = null;
  try {
    parsed = await parseDocumentBuffer({
      buffer,
      fileName: fileName || "document.pdf",
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
    fileName: fileName || "document.pdf",
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
  const report = (phase, current, total) =>
    updateDeckJobProgress({ jobId: job.id, phase, current, total });

  await report("解析素材", 0, job.slide_count);
  const sourceMarkdown =
    job.input_kind === "document"
      ? await extractSourceMarkdown({
          documentUrl: job.source_document_url,
          fileName: job.source_file_name,
        })
      : null;

  await report("規劃簡報大綱", 0, job.slide_count);
  const outline = await generateOutline({
    topic: job.topic,
    sourceMarkdown,
    slideCount: job.slide_count,
  });

  const [fonts, templateSpecs] = await Promise.all([
    pptMaster.getFonts(),
    resolveTemplateSpecs({
      styleId: job.style_id,
      layoutId: job.layout_id,
      brandId: job.brand_id,
    }),
  ]);

  const deck = await pptMaster.createDeck({ name: "pixora_deck" });
  try {
    const imagesBySlide = await generateDeckImages({
      deckId: deck.deckId,
      outline,
      onProgress: ({ phase }) => report(phase, 0, outline.slides.length),
    });

    await authorDeck({
      deckId: deck.deckId,
      outline,
      imagesBySlide,
      systemMessage: buildAuthoringSystemPrompt({
        fontFamilies: fonts?.families,
        templateSpecs,
      }),
      onProgress: ({ phase, current, total }) => report(phase, current, total),
    });

    await report("匯出 PowerPoint", outline.slides.length, outline.slides.length);
    const pptx = await pptMaster.exportDeck({ deckId: deck.deckId, fileStem: "pixora_deck" });

    const blobName = `decks/${job.id}.pptx`;
    await uploadGeneratedBlob({
      blobName,
      buffer: pptx,
      contentType: pptMaster.PPTX_CONTENT_TYPE,
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
  getDeckJobForUser,
  startDeckJobWorker,
};
