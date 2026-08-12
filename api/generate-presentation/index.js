const { corsHeaders, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { PRESENTATION_MAX_SLIDES, normalizePresentationSlides } = require("../_shared/presentationSchema");
const { generatePresentationPptx } = require("../_shared/pptxAutomizer");

const PPTX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
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

  const body = req.body || {};
  if (!Array.isArray(body.slides) || body.slides.length === 0) {
    context.res = error("缺少投影片內容", "bad_request", 400, req);
    return;
  }
  if (body.slides.length > PRESENTATION_MAX_SLIDES) {
    context.res = error("投影片數量不可超過 10 張", "bad_request", 400, req);
    return;
  }

  const slides = normalizePresentationSlides(body.slides);
  if (slides.length === 0) {
    context.res = error("沒有可匯出的投影片內容", "bad_request", 400, req);
    return;
  }

  try {
    const buffer = await generatePresentationPptx({ slides });
    const fileName = `pixora-presentation-${Date.now()}.pptx`;
    context.res = {
      status: 200,
      headers: {
        ...corsHeaders(req),
        "Content-Type": PPTX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
      body: buffer,
    };
  } catch (generationError) {
    context.log.error(
      "[generate-presentation] Automizer export failed:",
      generationError
    );
    context.res = error(
      "PowerPoint 產生失敗，請稍後重試",
      "presentation_generation_failed",
      502,
      req
    );
  }
};
