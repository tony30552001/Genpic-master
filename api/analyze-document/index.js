const { StorageSharedKeyCredential } = require("@azure/storage-blob");

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const {
  DocumentConversionError,
  inferMimeType,
  isSupportedDocument,
  parseDocumentBuffer,
} = require("../_shared/documentParser");
const {
  generateJsonCompletion,
  getDeployment,
} = require("../_shared/azureOpenAI");
const { rateLimit } = require("../_shared/rateLimit");
const { isUrlAllowed } = require("../_shared/urlValidator");

/**
 * 文件分析的系統提示詞（分鏡模式）
 * 要求 GPT 分析文件內容並回傳結構化的分鏡腳本
 */
const DOCUMENT_ANALYSIS_PROMPT_BASE = `請擔任專業的文件分析師與視覺導演。分析提供的文件，並以「最精簡有效」的 JSON 格式回傳：

1. "title": (string) 文件標題
2. "summary": (string, 繁體中文) 核心摘要（50字內）
3. "scenes": (array of objects) 分鏡腳本，依邏輯切分（3-10個）。每個場景包含：
   - "scene_number": (number) 編號
   - "scene_title": (string, 繁體中文) 簡短標題
   - "scene_description": (string, 繁體中文) 場景畫面描述與情緒氛圍（30-50字內）
   - "visual_prompt": (string, 英文) AI 生圖專用 Prompt。請直接列出構圖、主體、光影、風格等英文關鍵字，並以逗號分隔（50-80字內，極為重要）
   - "source_text": (string, 繁體中文) 擷取對應原文片段（30字內）
   
4. "characters": (array of objects) 核心角色/物件陣列（若無則為空陣列）：
   - "name": (string) 名稱
   - "description": (string, 繁體中文) 外觀特徵（30字內）

**重要規則：**
- 敘事流暢，專注於將文字轉化為視覺畫面。
- visual_prompt 必須精簡有力，只保留視覺名詞與形容詞，不要寫完整的長句子。
- scene_description 和 visual_prompt 絕對不可為空。
- 直接回傳 JSON，不要其他多餘對話。`;

/**
 * 簡報設計模式的系統提示詞
 * 要求 GPT 將文件/大綱轉換為適合簡報的結構化內容
 */
const PRESENTATION_ANALYSIS_PROMPT_BASE = `請擔任專業的簡報設計師與內容策略師。分析提供的文件或大綱，將其轉換為精美的投影片結構，並以「最精簡有效」的 JSON 格式回傳：

1. "title": (string) 簡報標題
2. "summary": (string, 繁體中文) 核心摘要（50字內）
3. "scenes": (array of objects) 投影片內容，依邏輯切分（3-10張）。每張投影片包含：
   - "scene_number": (number) 編號
   - "scene_title": (string, 繁體中文) 投影片標題（15字內，簡潔有力）
   - "scene_description": (string, 繁體中文) 這張投影片的核心主旨（30字內）
   - "bullet_points": (array of strings, 繁體中文) 3到5條重點項目，每條20字內，適合直接放入投影片
   - "speaker_notes": (string, 繁體中文) 講者備注，補充說明這張投影片的演講要點（60字內）
   - "visual_prompt": (string, 英文) AI 生圖專用 Prompt。描述這張投影片適合的配圖，列出構圖、主體、光影、風格等英文關鍵字，以逗號分隔（50-80字內）
   - "source_text": (string, 繁體中文) 擷取對應原文片段（30字內）
   - "layout_type": (string) 投影片版面建議：「default」（標題+重點+圖片）
   
4. "characters": (array of objects) 核心角色/物件陣列（若無則為空陣列）：
   - "name": (string) 名稱
   - "description": (string, 繁體中文) 描述（30字內）

**重要規則：**
- bullet_points 每條必須是獨立、完整的重點，適合直接朗讀。
- 第一張投影片通常是封面/簡介，可以是概述性內容。
- visual_prompt 必須精簡有力，只保留視覺名詞與形容詞。
- scene_description、bullet_points 和 visual_prompt 絕對不可為空。
- 直接回傳 JSON，不要其他多餘對話。`;

/**
 * 根據 mode 與 sceneCount 參數建構完整的 Prompt
 * @param {number|string} sceneCount - 目標場景數量（'auto' 或數字）
 * @param {'storyboard'|'presentation'} mode - 分析模式
 */
const buildAnalysisPrompt = (sceneCount, mode = 'storyboard') => {
  let prompt = mode === 'presentation'
    ? PRESENTATION_ANALYSIS_PROMPT_BASE
    : DOCUMENT_ANALYSIS_PROMPT_BASE;

  if (sceneCount && sceneCount !== 'auto' && !isNaN(Number(sceneCount))) {
    // 限制最大分鏡數量為 10
    const count = Math.min(Math.max(1, Math.floor(Number(sceneCount))), 10);

    const modeLabel = mode === 'presentation' ? '投影片' : '場景';
    prompt += `\n\n**重要：使用者指定參考的${modeLabel}數量約為 ${count} 個，請盡可能以這個數量為基準進行拆分。若文件長度無法完美契合該數量，可容許依據邏輯自然增減，但請以 ${count} 個作為目標。**`;
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
    const { documentUrl, fileName, contentType, base64Content, sceneCount, mode } = req.body || {};
    const analysisMode = (mode === 'presentation') ? 'presentation' : 'storyboard';
    context.log("[analyze-document] Step 2: Params -",
      "fileName:", fileName,
      "contentType:", contentType,
      "hasBase64:", !!base64Content,
      "base64Len:", base64Content?.length || 0,
      "hasUrl:", !!documentUrl,
      "sceneCount:", sceneCount || "auto",
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

    const modelName = getDeployment();
    context.log(
      "[analyze-document] Step 4: Call Azure OpenAI, model:",
      modelName,
      "finalMimeType:",
      parsedDocument.mimeType
    );

    const analysisPrompt = buildAnalysisPrompt(sceneCount, analysisMode);
    let userMessage;
    let imageDataUrl;
    let fileDataUrl;

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
      const mediaDataUrl =
        `data:${parsedDocument.mimeType};base64,${parsedDocument.buffer.toString("base64")}`;
      userMessage =
        parsedDocument.mimeType === "application/pdf"
          ? "請分析附加的掃描型 PDF，依可辨識內容建立結果。"
          : "請分析附加的圖片，依可辨識的文字與視覺內容建立結果。";
      if (parsedDocument.mimeType === "application/pdf") {
        fileDataUrl = mediaDataUrl;
      } else {
        imageDataUrl = mediaDataUrl;
      }
    }

    let data;
    try {
      data = await generateJsonCompletion({
        systemMessage: analysisPrompt,
        userMessage,
        imageDataUrl,
        fileDataUrl,
        fileName,
        maxOutputTokens: 8192,
      });
      context.log(
        "[analyze-document] Step 5: Azure OpenAI responded, data keys:",
        Object.keys(data || {})
      );
    } catch (gptError) {
      context.log.error("[analyze-document] Azure OpenAI API error:", gptError.message);
      context.res = error(
        `GPT 模型呼叫失敗：${gptError.message}`,
        "gpt_analysis_error",
        502
      );
      return;
    }
    context.log("[analyze-document] Step 6: Parse OK, scenes:", data?.scenes?.length);

    // 驗證必要欄位
    // 模型有時會直接回傳 scenes 陣列而非物件
    if (Array.isArray(data)) {
      context.log("[analyze-document] data is array, wrapping...");
      data = { scenes: data, title: fileName || "未命名文件", summary: "" };
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

    // 確保每個場景都有必要欄位，過濾掉完全空白的場景（向下相容駝峰命名）
    const rawScenes = data.scenes.map((scene, index) => ({
      scene_number: scene.scene_number || scene.sceneNumber || index + 1,
      scene_title: scene.scene_title || scene.sceneTitle || `場景 ${index + 1}`,
      scene_description: scene.scene_description || scene.sceneDescription || scene.description || "",
      visual_prompt: scene.visual_prompt || scene.visualPrompt || scene.prompt || scene.scene_description || scene.sceneDescription || scene.description || "",
      key_elements: scene.key_elements || scene.keyElements || [],
      mood: scene.mood || "",
      source_text: scene.source_text || scene.sourceText || "",
      // 簡報模式新增欄位（分鏡模式下可能為空，保持向後相容）
      bullet_points: Array.isArray(scene.bullet_points) ? scene.bullet_points.map(String).filter(Boolean) : [],
      speaker_notes: typeof scene.speaker_notes === 'string' ? scene.speaker_notes : "",
      layout_type: typeof scene.layout_type === 'string' ? scene.layout_type : "default",
    }));

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
      content_type: data.content_type || data.contentType || "document",
      page_count: data.page_count || data.pageCount || validatedScenes.length,
      scenes: validatedScenes,
      characters: validatedCharacters,
      total_scenes: validatedScenes.length,
      estimated_generation_time: validatedScenes.length * 15,
      analysis_mode: analysisMode,
      analysis_provider: "azure_openai",
      analysis_model: modelName,
      source_parser: parsedDocument.parser,
      source_format: parsedDocument.format,
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
