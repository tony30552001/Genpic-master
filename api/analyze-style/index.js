const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { generateJson } = require("../_shared/llmRuntime");
const {
  LlmConfigurationError,
  resolveRoleModel,
} = require("../_shared/llmModels");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const {
  downloadOwnedImage,
  resolveOwnedImageUpload,
} = require("../_shared/imageUploads");

const normalizeTags = (raw) => {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
};

const safeString = (v, fallback = "") =>
  v == null ? fallback : typeof v === "string" ? v : String(v);

const sanitizeAnalysisResult = (data) => ({
  style_prompt: safeString(data.style_prompt),
  style_description_zh: safeString(data.style_description_zh),
  image_content: safeString(data.image_content),
  suggested_tags: normalizeTags(data.suggested_tags),
  // 保留任何其他 Gemini 可能額外回傳的欄位，但不影響渲染
});


const STYLE_ANALYSIS_PROMPT = `請擔任專業視覺分析師。請分析這張圖片並回傳一個 JSON 物件，包含以下欄位：
1. "style_prompt": (英文) 以完整句子寫成一段風格指示，描述圖片的視覺風格、藝術流派、配色方案、光影、材質與構圖特徵。
   這段文字會被套用到完全不同的主題上，因此嚴禁提及圖片中的具體主體、人物、物件或文字內容，也嚴禁輸出逗號分隔的關鍵字清單。
2. "style_description_zh": (繁體中文) 以優美的文字，詳細描述此風格的視覺特徵、帶給人的感受、適合的使用場景。這將呈現給使用者看作為風格介紹。
3. "image_content": (繁體中文) 詳細描述圖片中的具體內容、發生的劇情、人物動作、場景細節。這將作為預設的劇情腳本。
4. "suggested_tags": (Array of Strings) 針對此風格建議的 3-5 個繁體中文標籤 (Tags)。`;

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

  const { referenceUploadId } = req.body || {};
  if (typeof referenceUploadId !== "string" || !referenceUploadId.trim()) {
    context.res = error("找不到可用的上傳圖片", "upload_not_found", 404);
    return;
  }

  try {
    const identity = await resolveIdentity(auth.user);
    if (!identity.userId || !identity.tenantId) {
      context.res = error("無法辨識使用者", "unauthorized", 401);
      return;
    }

    const upload = await resolveOwnedImageUpload({
      uploadId: referenceUploadId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (!upload) {
      context.res = error("找不到可用的上傳圖片", "upload_not_found", 404);
      return;
    }

    const llm = await resolveRoleModel(identity.tenantId, "style_analysis");
    const source = await downloadOwnedImage(upload);
    const base64Data = source.buffer.toString("base64");
    const mimeType = source.contentType;

    const raw = await generateJson({
      llm,
      systemMessage: STYLE_ANALYSIS_PROMPT,
      userMessage: "請分析附加的參考圖片。",
      attachment: { mimeType, base64: base64Data },
    });

    const sanitized = sanitizeAnalysisResult(raw);
    const tags = sanitized.suggested_tags;
    const styleName = safeString(raw.style_name).trim() || tags[0] || "未命名風格";

    context.res = ok({
      ...sanitized,
      style_name: styleName,
      styleId: null,
    });
  } catch (err) {
    context.log.error("Analyze style failed", err);
    if (err instanceof LlmConfigurationError) {
      context.res = error(err.message, err.code, err.status);
      return;
    }
    if (process.env.AUTH_DISABLED === "true") {
      context.res = error(
        err?.message || "分析失敗",
        "analysis_failed",
        502
      );
      return;
    }
    context.res = error("分析失敗", "analysis_failed", 502);
  }
};
