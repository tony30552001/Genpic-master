const { corsHeaders, ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const {
  createDeckJob,
  getDeckJobForUser,
  getDeckSlidePreview,
  listDeckJobEvents,
  listDeckSlidePreviews,
} = require("../_shared/deckJobs");
const { downloadGeneratedBlob } = require("../_shared/blobStorage");
const { deckImageBlobName } = require("../_shared/deckImages");
const { inlineSlideImages } = require("../_shared/deckPreview");
const { isConfigured, PPTX_CONTENT_TYPE } = require("../_shared/pptMasterClient");
const {
  normalizeImageDensity,
  normalizeSlideCount,
} = require("../_shared/deckContract");

const IMAGE_CONTENT_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value || ""
  );

const TEMPLATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const normalizeTemplateId = (value) => {
  const id = String(value || "").trim();
  if (!id) return null;
  return TEMPLATE_ID.test(id) ? id : null;
};

const buildJobBody = (job, events = [], slides = []) => {
  const body = {
    jobId: job.id,
    status: job.status,
    inputKind: job.input_kind,
    slideCount: job.slide_count,
    imageDensity: job.image_density,
    deckTitle: job.deck_title,
    phase: job.phase,
    progress: {
      current: job.progress_current,
      total: job.progress_total,
    },
    events: events.map((event) => ({
      id: Number(event.id),
      step: event.step,
      status: event.status,
      slideNumber: event.slide_number,
      detail: event.detail,
      at: event.created_at,
    })),
    slides: slides.map((slide) => ({
      slideNumber: slide.slide_number,
      revision: slide.revision,
      title: slide.title,
    })),
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  };

  if (job.status === "succeeded") {
    body.fileName = job.result_file_name;
    body.downloadPath = `/api/deck-jobs/${job.id}/download`;
  } else if (job.status === "failed") {
    body.error = {
      code: job.error_code || "deck_generation_failed",
      message: job.error_message || "簡報生成失敗，請稍後重試",
    };
  }

  return body;
};

/**
 * Serve one authored slide as a standalone SVG preview.
 *
 * The browser renders it inside `<img>`, so the illustration has to be inlined
 * here: that sandbox cannot load external resources. Caching is left to the
 * client, which keys previews by the slide's revision.
 */
const handleSlidePreview = async (context, req, job, slideNumber) => {
  const preview = await getDeckSlidePreview({ jobId: job.id, slideNumber });
  if (!preview) {
    context.res = error("這一頁尚未產出", "not_found", 404, req);
    return;
  }

  const svg = await inlineSlideImages(preview.svg, async (name) => {
    const suffix = name.split(".").pop().toLowerCase();
    const buffer = await downloadGeneratedBlob({
      blobName: deckImageBlobName({ jobId: job.id, name }),
    });
    return { buffer, contentType: IMAGE_CONTENT_TYPES[suffix] || "image/png" };
  });

  context.res = {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
    body: svg,
  };
};

const handleDownload = async (context, req, job) => {
  if (job.status !== "succeeded" || !job.result_blob_name) {
    context.res = error("簡報尚未完成", "not_ready", 409, req);
    return;
  }

  const buffer = await downloadGeneratedBlob({ blobName: job.result_blob_name });
  const fileName = encodeURIComponent(job.result_file_name || "presentation.pptx");

  context.res = {
    status: 200,
    headers: {
      ...corsHeaders(req),
      "Content-Type": PPTX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${fileName}`,
      "Content-Length": String(buffer.length),
      "Cache-Control": "no-store",
    },
    body: buffer,
  };
};

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429, req);
    return;
  }

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }

  if (method === "GET") {
    const jobId = req.params?.id;
    if (!isUuid(jobId)) {
      context.res = error("job id 格式無效", "bad_request", 400, req);
      return;
    }

    const slideParam = req.params?.slideNumber;
    const slideNumber = slideParam == null ? null : Number(slideParam);
    if (slideParam != null && !Number.isInteger(slideNumber)) {
      context.res = error("投影片頁碼格式無效", "bad_request", 400, req);
      return;
    }

    const action = req.params?.action;
    if (slideNumber == null && action && action !== "download") {
      context.res = error("不支援的操作", "not_found", 404, req);
      return;
    }

    const job = await getDeckJobForUser({
      jobId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!job) {
      context.res = error("找不到簡報生成工作", "not_found", 404, req);
      return;
    }

    if (slideNumber != null) {
      await handleSlidePreview(context, req, job, slideNumber);
      return;
    }

    if (action === "download") {
      await handleDownload(context, req, job);
      return;
    }

    context.res = ok(
      buildJobBody(
        job,
        await listDeckJobEvents({ jobId }),
        await listDeckSlidePreviews({ jobId })
      ),
      200,
      req
    );
    return;
  }

  if (method !== "POST") {
    context.res = error("不支援的請求方法", "method_not_allowed", 405, req);
    return;
  }

  if (!isConfigured()) {
    context.res = error(
      "PPT Master 服務尚未設定，請聯絡管理員",
      "service_unavailable",
      503,
      req
    );
    return;
  }

  const body = req.body || {};
  const topic = String(body.topic || "").trim();
  const documentUrl = String(body.documentUrl || "").trim();
  const inputKind = documentUrl ? "document" : "topic";

  if (inputKind === "topic" && topic.length < 4) {
    context.res = error("請輸入至少 4 個字的簡報主題", "bad_request", 400, req);
    return;
  }
  if (topic.length > 2000) {
    context.res = error("簡報主題過長", "bad_request", 400, req);
    return;
  }

  const job = await createDeckJob({
    tenantId: identity.tenantId,
    userId: identity.userId,
    inputKind,
    topic: topic || null,
    sourceDocumentUrl: documentUrl || null,
    sourceFileName: String(body.fileName || "").trim() || null,
    slideCount: normalizeSlideCount(body.slideCount),
    imageDensity: normalizeImageDensity(body.imageDensity),
    styleId: normalizeTemplateId(body.styleId),
    layoutId: normalizeTemplateId(body.layoutId),
    brandId: normalizeTemplateId(body.brandId),
  });

  context.res = ok(
    {
      jobId: job.id,
      status: job.status,
      createdAt: job.created_at,
    },
    202,
    req
  );
};
