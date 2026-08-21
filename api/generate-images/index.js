const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { generateGeminiImage } = require("../_shared/geminiImage");
const { rateLimit } = require("../_shared/rateLimit");
const { isUrlAllowed } = require("../_shared/urlValidator");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { createImageJob } = require("../_shared/imageJobs");
const { IMAGE_QUALITIES, generateGptImage } = require("../_shared/gptImage");
const { buildImagePrompt } = require("../_shared/imagePrompt");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401);
    return;
  }

  const modelPolicy = await ensureModelPolicy(identity.tenantId);
  const selectedModel = modelPolicy.defaultModel;
  const {
    userScript,
    stylePrompt,
    styleTags,
    purpose,
    imageLanguage,
    aspectRatio,
    imageSize,
    imageUrl,
    quality,
  } = req.body || {};
  if (!userScript || !String(userScript).trim()) {
    context.res = error("缺少 userScript", "bad_request", 400);
    return;
  }
  if (quality && !IMAGE_QUALITIES.includes(quality)) {
    context.res = error("不支援的圖片品質", "bad_request", 400);
    return;
  }

  try {
    const prompt = buildImagePrompt({
      userScript,
      stylePrompt,
      styleTags,
      purpose,
      imageLanguage,
    });

    if (selectedModel === "gpt-image-2") {
      if (process.env.FUNCTIONS_WORKER_RUNTIME) {
        const result = await generateGptImage({ prompt, aspectRatio, quality });
        context.res = ok({
          ...result,
          aspectRatio: aspectRatio || "1:1",
          prompt,
          model: selectedModel,
        });
        return;
      }

      const job = await createImageJob({
        tenantId: identity.tenantId,
        userId: identity.userId,
        prompt,
        aspectRatio,
        imageSize,
        quality,
        model: selectedModel,
      });
      context.res = ok(
        {
          jobId: job.id,
          status: job.status,
          aspectRatio: aspectRatio || "1:1",
          prompt,
          model: selectedModel,
        },
        202
      );
      return;
    }

    const parts = [];

    if (imageUrl) {
      // SSRF 防護：驗證 imageUrl 是否在允許的白名單內
      if (!isUrlAllowed(imageUrl)) {
        context.res = error("提供的圖片 URL 不在允許範圍內", "bad_request", 400);
        return;
      }

      try {
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error("Failed to fetch image");
        const arrayBuffer = await imageResponse.arrayBuffer();
        parts.push({
          base64: Buffer.from(arrayBuffer).toString("base64"),
          mimeType: imageResponse.headers.get("content-type") || "image/jpeg",
        });
      } catch (imgErr) {
        context.log.warn("Failed to fetch reference image:", imgErr);
      }
    }

    const image = await generateGeminiImage({
      prompt,
      aspectRatio,
      imageSize,
      referenceImage: parts[0],
      logger: context.log,
    });

    context.res = ok({
      imageUrl: `data:${image.mimeType};base64,${image.base64}`,
      aspectRatio: aspectRatio || "16:9",
      prompt: image.prompt,
      model: selectedModel,
    });
  } catch (err) {
    context.log.error("Image generation failed:", err);

    // 檢查是否為伺服器尖峰過載錯誤
    const errStr = String(err.message || err);
    const isOverloaded = errStr.includes("503") || errStr.includes("429") || errStr.includes("UNAVAILABLE") || errStr.includes("high demand");

    if (isOverloaded) {
      context.res = error(
        "目前 AI 繪圖伺服器處於尖峰時段，過於繁忙，請稍後一分鐘再試。",
        "server_overloaded",
        503
      );
    } else {
      // 非過載錯誤：回傳通用訊息，避免洩漏內部錯誤細節
      context.log.error("Image generation failed (non-overload):", err.message);
      context.res = error("圖片生成失敗，請稍後重試", "generation_failed", 502);
    }
  }
};
