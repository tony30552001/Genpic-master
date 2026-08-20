const { StorageSharedKeyCredential } = require("@azure/storage-blob");

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
const { isUrlAllowed } = require("../_shared/urlValidator");
const {
  normalizeDocumentScene,
  normalizePresentationSlides,
  PRESENTATION_SCHEMA_VERSION,
} = require("../_shared/presentationSchema");

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
 * 簡報設計模式的系統提示詞
 * 要求 GPT 將文件/大綱轉換為適合簡報的結構化內容
 */
const PRESENTATION_ANALYSIS_PROMPT_BASE = `請擔任專業的簡報設計師與內容策略師。分析提供的文件或大綱，將其轉換為清晰、可直接編輯的投影片內容與版面結構，並以「最精簡有效」的 JSON 格式回傳：

1. "title": (string) 簡報標題
2. "summary": (string, 繁體中文) 核心摘要（50字內）
3. "slides": (array of objects) 每個項目代表一張完整投影片，依內容邏輯規劃（1-10張），不要回傳 scenes。每張投影片包含：
   - "slide_number": (number) 編號
   - "slide_type": (string) 只能是 "cover"、"section"、"content" 或 "closing"
   - "title": (string, 繁體中文) 投影片標題（20字內，簡潔有力）
   - "subtitle": (string, 繁體中文) 標題下方的一句摘要，沒有需要時回傳空字串
   - "body": (string, 繁體中文) 可直接放在投影片上的補充內容，若已使用 bullets 可回傳空字串
   - "bullets": (array of strings, 繁體中文) 2到5條獨立、完整的重點，封面或結尾可為空陣列
   - "speaker_notes": (string, 繁體中文) 講者備注，補充說明這張投影片的演講要點（60字內）
   - "source_excerpt": (string, 繁體中文) 擷取對應原文片段（30字內）
   - "table": (object|null) 若原文包含真正的表格資料，最多回傳1個表格；包含 "title"、"headers" 與 "rows"，最多8欄、10列；沒有表格時回傳 null
   - "chart": (object|null) 若原文包含可量化的資料，最多回傳1個圖表；包含 "type"、"title"、"labels" 與 "series"，沒有可靠數值時回傳 null
**重要規則：**
- 這是投影片內容生成流程，不是分鏡或故事板流程；不要產生 visual_prompt、scene_description 或 characters。
- 第一張通常使用 cover，章節轉折可使用 section，一般內容使用 content，最後總結可使用 closing；不要產生圖片或分鏡內容。
- bullets 必須是完整且可朗讀的重點，避免長篇段落與空泛描述。
- table 與 chart 只能使用文件中實際存在的資料，不可臆造數字；沒有可靠資料時必須回傳 null。
- 每張投影片最多提供一個 table 與一個 chart。
- 直接回傳 JSON，不要其他多餘對話。`;

/**
 * 根據 mode 與 itemCount 參數建構完整的 Prompt
 * @param {number|string} itemCount - 目標場景或投影片數量（'auto' 或數字）
 * @param {'storyboard'|'presentation'} mode - 分析模式
 */
const buildAnalysisPrompt = (itemCount, mode = 'storyboard') => {
  let prompt = mode === 'presentation'
    ? PRESENTATION_ANALYSIS_PROMPT_BASE
    : DOCUMENT_ANALYSIS_PROMPT_BASE;

  if (itemCount && itemCount !== 'auto' && !isNaN(Number(itemCount))) {
    const count = Math.min(Math.max(1, Math.floor(Number(itemCount))), 10);

    const modeLabel = mode === 'presentation' ? '投影片' : '場景';
    const actionLabel = mode === 'presentation' ? '規劃' : '拆分';
    prompt += `\n\n**重要：使用者指定參考的${modeLabel}數量約為 ${count} 個，請以 ${count} 個作為目標${actionLabel}內容。若文件長度無法完美契合，可依內容邏輯自然增減，但不可超過 10 個。**`;
  }
  return prompt;
};

/**
 * 從 Azure Blob Storage 直接下載文件（使用 SDK，不受公共存取設定影響）
 * @param {string} documentUrl - Blob URL，格式: https://<account>.blob.core.windows.net/<container>/<blobName>
 * @returns {{ buffer: Buffer, contentType: string }}
 */
const fetchDocumentAsBuffer = async (documentUrl, fileName) => {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;

  // 如果是本帳號的 Blob URL，用 SDK 直接下載（繞過公共存取限制）
  const blobHost = `${account}.blob.core.windows.net`;
  if (account && key && documentUrl.includes(blobHost)) {
    const url = new URL(documentUrl);
    const pathParts = url.pathname.split("/").filter(Boolean);
    if (pathParts.length >= 2) {
      const containerName = pathParts[0];
      const blobName = decodeURIComponent(pathParts.slice(1).join("/"));

      const { BlobServiceClient } = require("@azure/storage-blob");
      const sharedKey = new StorageSharedKeyCredential(account, key);
      const blobServiceClient = new BlobServiceClient(
        `https://${account}.blob.core.windows.net`,
        sharedKey
      );

      const blobClient = blobServiceClient
        .getContainerClient(containerName)
        .getBlobClient(blobName);

      const downloadResponse = await blobClient.download(0);
      let contentType = downloadResponse.contentType || "";

      // 若 Blob 儲存的 contentType 不可用（空或 octet-stream），依檔名推斷
      if (!contentType || contentType === "application/octet-stream") {
        const inferredName = fileName || blobName;
        contentType = inferMimeType(inferredName);
      }

      // 讀取 stream 為 buffer
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return { buffer, contentType };
    }
  }

  // 非 Blob URL 時用一般 HTTP fetch
  // SSRF 防護：驗證 URL 是否在白名單內再發起請求
  if (!isUrlAllowed(documentUrl)) {
    throw new Error(`不允許的文件 URL，請確認文件來源是否為合法的 Azure Blob Storage`);
  }

  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new Error(`Document fetch failed: ${response.status}`);
  }
  let contentType = response.headers.get("content-type") || "";
  // 若 HTTP 回傳的 content-type 是 octet-stream，依檔名推斷
  if (!contentType || contentType === "application/octet-stream") {
    contentType = fileName ? inferMimeType(fileName) : "application/pdf";
  }
  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
};

module.exports = async function (context, req) {
  context.log("[analyze-document] Function invoked, method:", req.method);

  // 最外層保護 — 確保任何未預期錯誤都會回傳 JSON 而非 crash
  try {
    if ((req.method || "").toUpperCase() === "OPTIONS") {
      context.res = options();
      return;
    }

    // 驗證身份
    context.log("[analyze-document] Step 1: Auth");
    const auth = await requireAuth(context, req);
    if (!auth) return;

    // 速率限制
    const limited = rateLimit(req, auth.user);
    if (limited.limited) {
      context.res = error("請求過於頻繁", "rate_limited", 429);
      return;
    }

    // 取得請求參數
    const {
      documentUrl,
      fileName,
      contentType,
      base64Content,
      sceneCount,
      slideCount,
      mode,
    } = req.body || {};
    const analysisMode = (mode === 'presentation') ? 'presentation' : 'storyboard';
    const itemCount = analysisMode === 'presentation' ? slideCount : sceneCount;
    context.log("[analyze-document] Step 2: Params -",
      "fileName:", fileName,
      "contentType:", contentType,
      "hasBase64:", !!base64Content,
      "base64Len:", base64Content?.length || 0,
      "hasUrl:", !!documentUrl,
      "itemCount:", itemCount || "auto",
      "mode:", analysisMode
    );

    // 驗證必要參數
    if (!documentUrl && !base64Content) {
      context.res = error("缺少文件內容（需提供 documentUrl 或 base64Content）", "bad_request", 400);
      return;
    }

    // 驗證檔案格式
    const mimeType = contentType || inferMimeType(fileName);
    if (!isSupportedDocument(mimeType, fileName)) {
      context.res = error(
        "不支援的檔案格式。支援 PDF、Word、PowerPoint、Excel、OpenDocument、RTF、EPUB、CSV、TXT、MD、PNG 與 JPG",
        "unsupported_format",
        400
      );
      return;
    }

    // 取得文件內容
    context.log("[analyze-document] Step 3: Prepare content, mimeType:", mimeType);
    let documentBuffer;
    let finalMimeType = mimeType;

    if (base64Content) {
      // 處理 Data URL 格式 (data:application/pdf;base64,xxxxx)
      if (base64Content.includes(",")) {
        documentBuffer = Buffer.from(base64Content.split(",")[1], "base64");
        const mimeMatch = base64Content.match(/data:([^;]+);/);
        if (mimeMatch) {
          finalMimeType = mimeMatch[1];
        }
      } else {
        documentBuffer = Buffer.from(base64Content, "base64");
      }
    } else if (documentUrl) {
      const fetched = await fetchDocumentAsBuffer(documentUrl, fileName);
      documentBuffer = fetched.buffer;
      // 若抓回來的 mimeType 仍是 octet-stream，再用 fileName 推斷一次
      finalMimeType = (fetched.contentType && fetched.contentType !== "application/octet-stream")
        ? fetched.contentType
        : inferMimeType(fileName);
    }

    if (!documentBuffer?.length) {
      context.res = error("無法取得文件內容", "document_fetch_failed", 400);
      return;
    }

    let parsedDocument;
    try {
      parsedDocument = await parseDocumentBuffer({
        buffer: documentBuffer,
        fileName,
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
      const identity = await resolveIdentity(auth.user);
      llm = await resolveRoleModel(identity.tenantId, "document_analysis");
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

    const analysisPrompt = buildAnalysisPrompt(itemCount, analysisMode);
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
        fileName,
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
      "[analyze-document] Step 6: Parse OK, items:",
      analysisMode === "presentation" ? data?.slides?.length : data?.scenes?.length
    );

    // 驗證必要欄位
    // 模型有時會直接回傳 scenes 陣列而非物件
    if (Array.isArray(data)) {
      context.log("[analyze-document] data is array, wrapping...");
      data = analysisMode === "presentation"
        ? { slides: data, title: fileName || "未命名文件", summary: "" }
        : { scenes: data, title: fileName || "未命名文件", summary: "" };
    }

    if (!data || typeof data !== "object") {
      data = {};
    }

    if (analysisMode === "presentation") {
      const slides = normalizePresentationSlides(data.slides);
      if (slides.length === 0) {
        context.log.error(
          "[analyze-document] Missing slides. data keys:",
          Object.keys(data),
          "data preview:",
          JSON.stringify(data).substring(0, 500)
        );
        context.res = error(
          "AI 回應缺少投影片內容，請稍後重試或減少投影片數量",
          "invalid_response",
          502
        );
        return;
      }

      const response = {
        title: data.title || fileName || "未命名簡報",
        summary: data.summary || "",
        recommended_style: null,
        content_type: data.content_type || data.contentType || "presentation",
        page_count: data.page_count || data.pageCount || slides.length,
        slides,
        total_slides: slides.length,
        estimated_generation_time: slides.length * 3,
        analysis_mode: analysisMode,
        analysis_provider: llm.model.provider,
        analysis_model: llm.model.modelName,
        source_parser: parsedDocument.parser,
        source_format: parsedDocument.format,
        presentation_schema_version: PRESENTATION_SCHEMA_VERSION,
      };

      context.log(
        "[analyze-document] Step 7: Success, total_slides:",
        response.total_slides
      );
      context.res = ok(response);
      return;
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
      title: data.title || fileName || "未命名文件",
      summary: data.summary || "",
      recommended_style: recommendedStyle,
      content_type: data.content_type || data.contentType || "document",
      page_count: data.page_count || data.pageCount || validatedScenes.length,
      scenes: validatedScenes,
      characters: validatedCharacters,
      total_scenes: validatedScenes.length,
      estimated_generation_time: validatedScenes.length * 15,
      analysis_mode: analysisMode,
      analysis_provider: llm.model.provider,
      analysis_model: llm.model.modelName,
      source_parser: parsedDocument.parser,
      source_format: parsedDocument.format,
      presentation_schema_version:
        analysisMode === "presentation" ? PRESENTATION_SCHEMA_VERSION : null,
    };

    context.log("[analyze-document] Step 7: Success, total_scenes:", response.total_scenes);
    context.res = ok(response);
  } catch (err) {
    // 最外層 catch — 防止任何未預期錯誤導致函式崩潰
    context.log.error("[analyze-document] UNHANDLED ERROR:", err.message);
    context.log.error("[analyze-document] Stack:", err.stack);
    context.res = error(
      err.message || "文件分析失敗，請稍後重試",
      "analysis_failed",
      500
    );
  }
};
