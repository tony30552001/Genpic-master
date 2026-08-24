const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const {
  DocumentConversionError,
  inferMimeType,
  isSupportedDocument,
  parseDocumentBuffer,
} = require("../_shared/documentParser");
const { resolveIdentity } = require("../_shared/identity");
const {
  LlmConfigurationError,
  resolveRoleModel,
} = require("../_shared/llmModels");
const { generateJson } = require("../_shared/llmRuntime");
const { rateLimit } = require("../_shared/rateLimit");
const { getOwnedUpload } = require("../_shared/uploads");
const { downloadUploadBuffer } = require("../_shared/uploadStorage");
const {
  normalizeDocumentScene,
} = require("../_shared/documentScene");

const MAX_BASE64_BYTES = 80 * 1024;
const MAX_BASE64_ENCODED_LENGTH = Math.ceil(MAX_BASE64_BYTES / 3) * 4;
const MAX_DATA_URL_HEADER_LENGTH = 256;
const MAX_BASE64_INPUT_LENGTH =
  MAX_BASE64_ENCODED_LENGTH + MAX_DATA_URL_HEADER_LENGTH;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIME_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

const safeString = (value, fallback = "") =>
  value == null ? fallback : typeof value === "string" ? value : String(value);

const normalizeTags = (raw) => {
  if (Array.isArray(raw)) return raw.map((tag) => String(tag).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
};

const normalizeRecommendedStyle = (raw) => {
  const style = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw
    : {};

  return {
    name: safeString(style.name).trim() || "AI 文件建議風格",
    description: safeString(style.description).trim(),
    prompt: safeString(style.prompt).trim(),
    tags: normalizeTags(style.tags),
  };
};

/**
 * 文件分析的系統提示詞（分鏡模式）
 * 要求 GPT 分析文件內容並回傳結構化的分鏡腳本
 */
const DOCUMENT_ANALYSIS_PROMPT_BASE = `請擔任專業的文件分析師與視覺導演。分析提供的文件，並以「最精簡有效」的 JSON 格式回傳：

1. "title": (string) 文件標題
2. "summary": (string, 繁體中文) 核心摘要（50字內）
3. "recommended_style": (object) 根據文件主題、語氣、受眾與內容性質，為所有場景推薦一套最適合的文字與圖片視覺風格。這是文件分析的預設風格，請務必回傳：
   - "name": (string, 繁體中文) 簡潔的風格名稱
   - "description": (string, 繁體中文) 說明此風格為何適合這份文件，以及預期的視覺感受（50字內）
   - "prompt": (string, 英文) 可直接用於 AI 生圖的共用風格 Prompt，描述藝術媒材、色彩、構圖、光影、材質與文字圖片搭配時的視覺方向（40-70字）
   - "tags": (Array of Strings) 3-5 個繁體中文風格標籤
4. "scenes": (array of objects) 分鏡腳本，依邏輯切分（3-10個）。每個場景包含：
   - "scene_number": (number) 編號
   - "scene_title": (string, 繁體中文) 簡短標題
   - "scene_description": (string, 繁體中文) 場景畫面描述與情緒氛圍（30-50字內）
   - "visual_prompt": (string, 英文) AI 生圖專用 Prompt。請直接列出構圖、主體、光影、風格等英文關鍵字，並以逗號分隔（50-80字內，極為重要）
   - "source_text": (string, 繁體中文) 擷取對應原文片段（30字內）
   
5. "characters": (array of objects) 核心角色/物件陣列（若無則為空陣列）：
   - "name": (string) 名稱
   - "description": (string, 繁體中文) 外觀特徵（30字內）

**重要規則：**
- 敘事流暢，專注於將文字轉化為視覺畫面。
- recommended_style 必須是完整且一致的文件級風格方向，不能只回傳抽象形容詞；prompt 必須能直接套用到每個場景的圖片生成。
- visual_prompt 必須精簡有力，只保留視覺名詞與形容詞，不要寫完整的長句子。
- recommended_style.prompt、scene_description 和 visual_prompt 絕對不可為空。
- 直接回傳 JSON，不要其他多餘對話。`;

/**
 * 根據 sceneCount 參數建構完整的 Prompt
 * @param {number|string} sceneCount - 目標場景數量（'auto' 或數字）
 */
const buildAnalysisPrompt = (sceneCount) => {
  let prompt = DOCUMENT_ANALYSIS_PROMPT_BASE;

  if (sceneCount && sceneCount !== 'auto' && !isNaN(Number(sceneCount))) {
    const count = Math.min(Math.max(1, Math.floor(Number(sceneCount))), 10);

    prompt += `\n\n**重要：使用者指定參考的場景數量約為 ${count} 個，請以 ${count} 個作為目標拆分內容。若文件長度無法完美契合，可依內容邏輯自然增減，但不可超過 10 個。**`;
  }
  return prompt;
};

const uploadNotFound = () =>
  error("找不到可用的上傳文件", "upload_not_found", 404);

const hasUsableExpiry = (upload) => {
  const expiresAt = new Date(upload?.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const isOwnedReadyDocument = (upload, owner, uploadId) =>
  upload?.id === uploadId &&
  upload.tenant_id === owner.tenantId &&
  upload.user_id === owner.userId &&
  upload.purpose === "document" &&
  upload.status === "ready" &&
  hasUsableExpiry(upload);

const decodeBase64Content = (base64Content) => {
  if (typeof base64Content !== "string") return { invalid: true };
  if (base64Content.length > MAX_BASE64_INPUT_LENGTH) {
    return { tooLarge: true };
  }

  let encoded = base64Content;
  let mimeType = null;
  if (base64Content.slice(0, 5).toLowerCase() === "data:") {
    const commaIndex = base64Content.indexOf(",");
    if (commaIndex < 0 || commaIndex + 1 > MAX_DATA_URL_HEADER_LENGTH) {
      return { invalid: true };
    }
    const header = base64Content.slice(0, commaIndex + 1);
    const envelope = /^data:([^;,]+);base64,$/i.exec(header);
    const mimeMatch = envelope && MIME_TYPE_PATTERN.exec(envelope[1]);
    if (!envelope || !mimeMatch || mimeMatch[0].length !== envelope[1].length) {
      return { invalid: true };
    }
    mimeType = envelope[1].toLowerCase();
    encoded = base64Content.slice(commaIndex + 1);
  }

  if (encoded.length > MAX_BASE64_ENCODED_LENGTH) return { tooLarge: true };
  if (!encoded || encoded.length % 4 !== 0) return { invalid: true };

  const alphabetMatch = /^[a-z0-9+/]*={0,2}/i.exec(encoded);
  if (!alphabetMatch || alphabetMatch[0].length !== encoded.length) {
    return { invalid: true };
  }

  const buffer = Buffer.from(encoded, "base64");
  if (buffer.toString("base64") !== encoded) return { invalid: true };
  if (buffer.length > MAX_BASE64_BYTES) return { tooLarge: true };
  return { buffer, mimeType };
};

const analyzeDocumentHandler = async function (context, req) {
  context.log("[analyze-document] Function invoked, method:", req.method);

  // 最外層保護 — 確保任何未預期錯誤都會回傳 JSON 而非 crash
  try {
    if ((req.method || "").toUpperCase() === "OPTIONS") {
      context.res = options();
      return;
    }

    // 驗證身份。背景 worker 已在建立工作時完成 owner 綁定，重試時
    // 不應再次依賴瀏覽器 Cookie；這也讓分析工作能在 API 45 秒代理期限外完成。
    context.log("[analyze-document] Step 1: Auth");
    const isBackgroundJob = Boolean(context._documentOwner);
    const auth = isBackgroundJob
      ? { user: null }
      : await requireAuth(context, req);
    if (!auth) return;

    // 速率限制
    const limited = isBackgroundJob ? { limited: false } : rateLimit(req, auth.user);
    if (limited.limited) {
      context.res = error("請求過於頻繁", "rate_limited", 429);
      return;
    }

    // 取得請求參數
    const requestBody = req.body || {};
    const {
      uploadId,
      fileName: requestedFileName,
      contentType,
      base64Content,
      sceneCount,
    } = requestBody;
    const hasBase64Content = Object.prototype.hasOwnProperty.call(
      requestBody,
      "base64Content"
    );
    context.log("[analyze-document] Step 2: Params -",
      "hasBase64:", hasBase64Content,
      "hasUpload:", !!uploadId,
      "sceneCount:", sceneCount || "auto"
    );

    // 驗證必要參數
    if (!uploadId && !hasBase64Content) {
      context.res = error("缺少文件內容（需提供 uploadId 或 base64Content）", "bad_request", 400);
      return;
    }
    if (uploadId && hasBase64Content) {
      context.res = error("請勿同時提供 uploadId 與 base64Content", "bad_request", 400);
      return;
    }

    // 取得文件內容
    context.log("[analyze-document] Step 3: Prepare content");
    let documentBuffer;
    let finalMimeType;
    let trustedFileName = requestedFileName;
    let owner;

    if (hasBase64Content) {
      const decoded = decodeBase64Content(base64Content);
      if (decoded.tooLarge) {
        context.res = error(
          "Base64 文件內容超過 80 KiB 限制",
          "base64_too_large",
          413
        );
        return;
      }
      if (decoded.invalid) {
        context.res = error(
          "Base64 文件內容格式錯誤",
          "invalid_base64",
          400
        );
        return;
      }

      documentBuffer = decoded.buffer;
      finalMimeType = decoded.mimeType || contentType || inferMimeType(trustedFileName);
    } else {
      if (typeof uploadId !== "string" || !UUID_PATTERN.test(uploadId)) {
        context.res = uploadNotFound();
        return;
      }
      const canonicalUploadId = uploadId.toLowerCase();

      owner = context._documentOwner || await resolveIdentity(auth.user);
      if (!owner?.tenantId || !owner?.userId) {
        context.res = error("無法辨識使用者", "unauthorized", 401);
        return;
      }

      const upload = await getOwnedUpload({
        uploadId: canonicalUploadId,
        tenantId: owner.tenantId,
        userId: owner.userId,
        purpose: "document",
        status: "ready",
      });
      if (!isOwnedReadyDocument(upload, owner, canonicalUploadId)) {
        context.res = uploadNotFound();
        return;
      }

      trustedFileName = upload.original_file_name;
      if (typeof trustedFileName !== "string" || !trustedFileName) {
        context.res = uploadNotFound();
        return;
      }
      const storedContentType = String(upload.content_type || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      finalMimeType = !storedContentType || storedContentType === "application/octet-stream"
        ? inferMimeType(trustedFileName)
        : storedContentType;
      documentBuffer = await downloadUploadBuffer(upload);
    }

    if (!documentBuffer?.length) {
      context.res = error("無法取得文件內容", "document_fetch_failed", 400);
      return;
    }

    // 驗證可信任中繼資料對應的檔案格式
    if (!isSupportedDocument(finalMimeType, trustedFileName)) {
      context.res = error(
        "不支援的檔案格式。支援 PDF、Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、TXT、MD、PNG 與 JPG",
        "unsupported_format",
        400
      );
      return;
    }

    let parsedDocument;
    try {
      parsedDocument = await parseDocumentBuffer({
        buffer: documentBuffer,
        fileName: trustedFileName,
        mimeType: finalMimeType,
      });
      context.log(
        "[analyze-document] Parsed source -",
        "parser:", parsedDocument.parser,
        "format:", parsedDocument.format,
        "kind:", parsedDocument.kind
      );
    } catch (conversionError) {
      if (conversionError instanceof DocumentConversionError) {
        context.log.warn(
          "[analyze-document] Document conversion rejected:",
          conversionError.code,
          conversionError.message
        );
        context.res = error(
          conversionError.message,
          conversionError.code,
          conversionError.status
        );
        return;
      }
      throw conversionError;
    }

    let llm;
    try {
      if (!owner) owner = await resolveIdentity(auth.user);
      llm = await resolveRoleModel(owner.tenantId, "document_analysis");
    } catch (configError) {
      if (configError instanceof LlmConfigurationError) {
        context.res = error(configError.message, configError.code, configError.status);
        return;
      }
      throw configError;
    }

    context.log(
      "[analyze-document] Step 4: Call Azure OpenAI, model:",
      llm.model.modelName,
      "finalMimeType:",
      parsedDocument.mimeType
    );

    const analysisPrompt = buildAnalysisPrompt(sceneCount);
    let userMessage;
    let attachment;

    if (parsedDocument.kind === "text") {
      const textContent = parsedDocument.text;
      context.log("[analyze-document] Text content length:", textContent.length);

      const configuredMaxChars = Number.parseInt(
        process.env.DOCUMENT_ANALYSIS_MAX_CHARS || "500000",
        10
      );
      const maxTextChars =
        Number.isFinite(configuredMaxChars) && configuredMaxChars > 0
          ? configuredMaxChars
          : 500000;
      if (textContent.length > maxTextChars) {
        context.res = error(
          `文件解析後共有 ${textContent.length} 字元，超過同步分析上限 ${maxTextChars}；請縮小文件後重試`,
          "document_text_too_large",
          413
        );
        return;
      }

      userMessage = `以下是待分析的文件內容：\n\n${textContent}`;
    } else {
      userMessage =
        parsedDocument.mimeType === "application/pdf"
          ? "請分析附加的掃描型 PDF，依可辨識內容建立結果。"
          : "請分析附加的圖片，依可辨識的文字與視覺內容建立結果。";
      attachment = {
        mimeType: parsedDocument.mimeType,
        base64: parsedDocument.buffer.toString("base64"),
      };
    }

    let data;
    try {
      data = await generateJson({
        llm,
        systemMessage: analysisPrompt,
        userMessage,
        attachment,
        fileName: trustedFileName,
        maxOutputTokens: 8192,
      });
      context.log(
        "[analyze-document] Step 5: analysis model responded, data keys:",
        Object.keys(data || {})
      );
    } catch (gptError) {
      context.log.error("[analyze-document] analysis model error:", gptError.message);
      context.res = error(
        `分析模型呼叫失敗：${gptError.message}`,
        "gpt_analysis_error",
        502
      );
      return;
    }
    context.log(
      "[analyze-document] Step 6: Parse OK, scenes:",
      data?.scenes?.length
    );

    // 驗證必要欄位
    // 模型有時會直接回傳 scenes 陣列而非物件
    if (Array.isArray(data)) {
      context.log("[analyze-document] data is array, wrapping...");
      data = { scenes: data, title: trustedFileName || "未命名文件", summary: "" };
    }

    if (!data || typeof data !== "object") {
      data = {};
    }

    if (!data.scenes || !Array.isArray(data.scenes) || data.scenes.length === 0) {
      context.log.error("[analyze-document] Missing scenes. data keys:", Object.keys(data || {}),
        "data type:", typeof data,
        "data preview:", JSON.stringify(data)?.substring(0, 500));
      context.res = error(
        "AI 回應缺少場景資訊，請稍後重試或減少場景數量",
        "invalid_response",
        502
      );
      return;
    }

    // 確保每個場景都有必要欄位，過濾掉完全空白的場景
    const rawScenes = data.scenes.map(normalizeDocumentScene);

    // 過濾掉 scene_description 和 visual_prompt 都為空的場景
    const validatedScenes = rawScenes.filter((scene) =>
      scene.scene_description.trim() || scene.visual_prompt.trim()
    );

    // 如果過濾後沒有有效場景，代表 AI 完全無法解析文件內容
    if (validatedScenes.length === 0) {
      context.log.warn("[analyze-document] All scenes were empty after filtering. AI failed to extract meaningful content.");
      context.log.warn("[analyze-document] === RAW JSON PARSED DATA ===");
      context.log.warn(JSON.stringify(data, null, 2));
      context.log.warn("[analyze-document] === RAW EXTRACTED SCENES ===");
      context.log.warn(JSON.stringify(rawScenes, null, 2));

      context.res = error(
        "分析失敗：AI 無法從此文件中提取有效內容。請確認文件是否為純圖片且無可識別文字，或換一份文件再試一次。",
        "empty_scenes",
        422
      );
      return;
    }

    const recommendedStyle = normalizeRecommendedStyle(data.recommended_style);
    if (!recommendedStyle.prompt) {
      context.log.warn("[analyze-document] Missing recommended document style.");
      context.res = error(
        "AI 回應缺少文件視覺風格，請稍後重試",
        "invalid_response",
        502
      );
      return;
    }

    // 診斷：如果場景數量異常少，記錄詳情
    if (validatedScenes.length <= 1) {
      context.log.warn(
        "[analyze-document] Only", validatedScenes.length, "scene(s) returned.",
        "Scene details:", JSON.stringify(validatedScenes.map(s => ({
          title: s.scene_title,
          descLen: s.scene_description?.length || 0,
          promptLen: s.visual_prompt?.length || 0,
        })))
      );
    }

    // 確保角色資訊存在（向下相容駝峰命名）
    const validatedCharacters = (data.characters || []).map((char) => ({
      name: char.name || "未命名角色",
      description: char.description || "",
      consistency_prompt: char.consistency_prompt || char.consistencyPrompt || "",
    }));

    // 回傳標準化結果
    const response = {
      title: data.title || trustedFileName || "未命名文件",
      summary: data.summary || "",
      recommended_style: recommendedStyle,
      content_type: data.content_type || data.contentType || "document",
      page_count: data.page_count || data.pageCount || validatedScenes.length,
      scenes: validatedScenes,
      characters: validatedCharacters,
      total_scenes: validatedScenes.length,
      estimated_generation_time: validatedScenes.length * 15,
      analysis_provider: llm.model.provider,
      analysis_model: llm.model.modelName,
      source_parser: parsedDocument.parser,
      source_format: parsedDocument.format,
    };

    context.log("[analyze-document] Step 7: Success, total_scenes:", response.total_scenes);
    context.res = ok(response);
  } catch {
    // 最外層 catch — 防止任何未預期錯誤導致函式崩潰
    context.log.error("[analyze-document] Unexpected analysis failure");
    context.res = error(
      "文件分析失敗，請稍後重試",
      "analysis_failed",
      500
    );
  }
};

const runDocumentAnalysis = async ({ requestBody, owner, context = {} }) => {
  if (!owner?.tenantId || !owner?.userId) {
    const invalidOwner = new Error("無法辨識使用者");
    invalidOwner.code = "unauthorized";
    invalidOwner.status = 401;
    throw invalidOwner;
  }

  const log = typeof context.log === "function" ? context.log : () => {};
  if (typeof log.warn !== "function") log.warn = () => {};
  if (typeof log.error !== "function") log.error = () => {};
  const workerContext = {
    ...context,
    log,
    _documentOwner: owner,
    res: undefined,
  };

  await analyzeDocumentHandler(workerContext, {
    method: "POST",
    headers: {},
    body: requestBody || {},
  });

  const response = workerContext.res;
  if (!response || response.status < 200 || response.status >= 300) {
    const failure = response?.body?.error || {};
    const error = new Error(failure.message || "文件分析失敗，請稍後重試");
    error.code = failure.code || "analysis_failed";
    error.status = response?.status || 500;
    throw error;
  }
  return response.body;
};

module.exports = analyzeDocumentHandler;
module.exports.runDocumentAnalysis = runDocumentAnalysis;
