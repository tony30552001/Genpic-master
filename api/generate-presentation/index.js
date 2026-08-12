const { corsHeaders, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const {
  generatePresentationPptx,
  normalizeScenes,
} = require("../_shared/pptxAutomizer");

const MAX_SCENES = 10;
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
  if (!Array.isArray(body.scenes) || body.scenes.length === 0) {
    context.res = error("缺少投影片內容", "bad_request", 400, req);
    return;
  }
  if (body.scenes.length > MAX_SCENES) {
    context.res = error("投影片數量不可超過 10 張", "bad_request", 400, req);
    return;
  }

  const scenes = normalizeScenes(body.scenes);
  if (scenes.length === 0) {
    context.res = error("沒有可匯出的投影片內容", "bad_request", 400, req);
    return;
  }
  const invalidImage = scenes.some(
    (scene) =>
      scene.generatedImage &&
      !/^data:image\/[a-z0-9.+-]+;base64,/i.test(scene.generatedImage)
  );
  if (invalidImage) {
    context.res = error(
      "Automizer 匯出只接受已嵌入的圖片資料",
      "invalid_image",
      400,
      req
    );
    return;
  }

  try {
    const buffer = await generatePresentationPptx({ scenes });
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
