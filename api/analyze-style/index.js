const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel, embedText } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");
const { query } = require("../_shared/db");
const { resolveIdentity } = require("../_shared/identity");
const { toVectorString } = require("../_shared/vector");

const STYLE_ANALYSIS_PROMPT = `請擔任專業視覺分析師。請分析這張圖片並回傳一個 JSON 物件，包含以下欄位：
1. "style_prompt": (英文) 詳細描述圖片的視覺風格、藝術流派、配色方案、光影與材質、構圖特徵。這將用於生成類似風格圖片的 Image Gen Prommpt。
2. "style_description_zh": (繁體中文) 以優美的文字，詳細描述此風格的視覺特徵、帶給人的感受、適合的使用場景。這將呈現給使用者看作為風格介紹。
3. "image_content": (繁體中文) 詳細描述圖片中的具體內容、發生的劇情、人物動作、場景細節。這將作為預設的劇情腳本。
4. "suggested_tags": (Array of Strings) 針對此風格建議的 3-5 個繁體中文標籤 (Tags)。`;

const fetchImageAsBase64 = async (imageUrl) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Image fetch failed");
  }
  const contentType = response.headers.get("content-type") || "image/png";
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, contentType };
};

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

  const { referencePreview, imageUrl } = req.body || {};
  if (!referencePreview && !imageUrl) {
    context.res = error("缺少參考圖片", "bad_request", 400);
    return;
  }

  try {
    const modelName = process.env.GEMINI_MODEL_ANALYSIS || "gemini-1.5-flash";
    const model = getModel(modelName);
    let base64Data = null;
    let mimeType = "image/png";

    if (imageUrl) {
      const fetched = await fetchImageAsBase64(imageUrl);
      base64Data = fetched.base64;
      mimeType = fetched.contentType;
    } else {
      base64Data = referencePreview.split(",")[1];
    }

    const result = await model.generateContent(
      [
        {
          role: "user",
          parts: [
            { text: STYLE_ANALYSIS_PROMPT },
            { inlineData: { mimeType, data: base64Data } },
          ],
        },
      ],
      {
        responseMimeType: "application/json",
      }
    );

    const parts =
      result?.candidates?.[0]?.content?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];
    let responseText = result?.text || result?.response?.text || "";
    if (!responseText && parts.length > 0) {
      responseText = parts.map((part) => part.text).filter(Boolean).join("\n");
    }
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseErr) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("解析 JSON 失敗");
      }
      data = JSON.parse(jsonMatch[0]);
    }
    const tags = Array.isArray(data.suggested_tags) ? data.suggested_tags : [];
    const styleName = tags[0] || "未命名風格";

    const embeddingModel = process.env.EMBEDDING_MODEL || "text-embedding-004";
    const embeddingText = [
      data.style_prompt,
      data.style_description_zh,
      tags.length > 0 ? tags.join(",") : null,
    ]
      .filter(Boolean)
      .join("\n");
    let embedding = null;
    let vectorString = null;
    let embeddingError = null;
    try {
      const values = await embedText(embeddingModel, embeddingText);
      if (Array.isArray(values)) {
        embedding = values;
        vectorString = toVectorString(values);
      } else {
        embeddingError = "embedding_not_available";
      }
    } catch (embedErr) {
      embedding = null;
      vectorString = null;
      embeddingError = "embedding_failed";
    }
    const identity = await resolveIdentity(auth.user);
    if (!identity.userId) {
      context.res = error("無法辨識使用者", "unauthorized", 401);
      return;
    }

    const insertResult = await query(
      "INSERT INTO styles (tenant_id, name, prompt, description, tags, preview_url, embedding, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8) RETURNING id",
      [
        identity.tenantId,
        styleName,
        data.style_prompt,
        data.style_description_zh || null,
        tags,
        imageUrl || null,
        vectorString,
        identity.userId,
      ]
    );

    context.res = ok({
      ...data,
      embedding,
      styleId: insertResult.rows[0]?.id,
      embedding_error: embeddingError,
    });
  } catch (err) {
    context.log.error("Analyze style failed", err);
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
