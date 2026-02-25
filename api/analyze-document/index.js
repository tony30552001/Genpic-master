const { StorageSharedKeyCredential } = require("@azure/storage-blob");

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");

/**
 * 文件分析的系統提示詞
 * 要求 Gemini 分析文件內容並回傳結構化的分鏡腳本
 */
const DOCUMENT_ANALYSIS_PROMPT_BASE = `請擔任專業的文件分析師與視覺導演。請深入分析所提供的文件內容，並回傳一個 JSON 物件，包含以下欄位：

1. "title": (string) 文件的標題或主題
2. "summary": (string, 繁體中文) 文件的整體摘要，100-200字
3. "scenes": (array of objects) 分鏡腳本陣列，每個場景包含：
   - "scene_number": (number) 場景編號
   - "scene_title": (string, 繁體中文) 場景標題（簡短描述）
   - "scene_description": (string, 繁體中文) 詳細的場景描述，包含人物動作、表情、場景細節
   - "visual_prompt": (string, 英文) 專門用於 AI 圖片生成的英文 Prompt，需詳細描述構圖、風格、光影
   - "key_elements": (array of strings) 場景中的關鍵視覺元素（人物、物品、場景特徵）
   - "mood": (string, 繁體中文) 場景情緒氛圍（如：溫馨、緊張、專業、歡樂）
   - "source_text": (string, 繁體中文) 此場景對應的原始文件內容片段（逐字引用原文，不要改寫，長度約50-200字）
   
4. "characters": (array of objects) 文件中出現的主要角色/物件，每個包含：
   - "name": (string) 角色名稱或描述
   - "description": (string, 繁體中文) 角色外觀特徵描述
   - "consistency_prompt": (string, 英文) 確保角色跨場景一致的描述詞

5. "page_count": (number) 估算的文件頁數/段落數
6. "content_type": (string) 文件類型（如：簡報、報告、SOP、劇本）

請確保：
- 場景切分邏輯合理，能呈現連續的敘事流程
- visual_prompt 應足夠詳細（150-300字），包含構圖、風格、光影描述
- 如果是簡報或PPT，每張投影片建議對應1-2個場景
- 如果是文章/報告，每個重要段落對應一個場景
- source_text 必須是從原始文件中直接擷取的文字片段，讓使用者可以對照原始資料`;

/**
 * 根據 sceneCount 參數建構完整的 Prompt
 */
const buildAnalysisPrompt = (sceneCount) => {
  let prompt = DOCUMENT_ANALYSIS_PROMPT_BASE;
  if (sceneCount && sceneCount !== 'auto' && Number(sceneCount) > 0) {
    prompt += `\n\n**重要：請將文件內容拆分為恰好 ${Number(sceneCount)} 個場景。確保每個場景的內容分量均勻，涵蓋文件的所有重要部分。**`;
  }
  return prompt;
};

/**
 * 從 Azure Blob Storage 直接下載文件（使用 SDK，不受公共存取設定影響）
 * @param {string} documentUrl - Blob URL，格式: https://<account>.blob.core.windows.net/<container>/<blobName>
 * @returns {{ base64: string, contentType: string }}
 */
const fetchDocumentAsBase64 = async (documentUrl, fileName) => {
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
        contentType = getMimeType(inferredName);
      }

      // 讀取 stream 為 buffer
      const chunks = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      return { base64: buffer.toString("base64"), contentType };
    }
  }

  // 非 Blob URL 時用一般 HTTP fetch
  const response = await fetch(documentUrl);
  if (!response.ok) {
    throw new Error(`Document fetch failed: ${response.status}`);
  }
  let contentType = response.headers.get("content-type") || "";
  // 若 HTTP 回傳的 content-type 是 octet-stream，依檔名推斷
  if (!contentType || contentType === "application/octet-stream") {
    contentType = fileName ? getMimeType(fileName) : "application/pdf";
  }
  const arrayBuffer = await response.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, contentType };
};

/**
 * 偵測檔案類型並回傳對應的 MIME type
 */
const getMimeType = (fileName) => {
  const ext = fileName?.toLowerCase().split(".").pop();
  const mimeTypes = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    txt: "text/plain",
    md: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

/**
 * 驗證支援的檔案格式
 */
const isSupportedFormat = (mimeType, fileName) => {
  const supportedMimeTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/png",
    "image/jpeg",
  ];

  // 如果直接有 MIME type，先檢查
  if (mimeType && supportedMimeTypes.includes(mimeType)) {
    return true;
  }

  // 依副檔名檢查
  const supportedExtensions = ["pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg"];
  const ext = fileName?.toLowerCase().split(".").pop();
  return supportedExtensions.includes(ext);
};

/**
 * 解析 Gemini 回應，處理各種可能的格式
 */
const parseGeminiResponse = (result, context) => {
  // 嘗試多種路徑找到文字內容
  let responseText = "";

  // 路徑 1: 直接 .text（@google/genai 的標準回傳，可能是 string 或 function）
  try {
    if (typeof result?.text === "function") {
      responseText = result.text();
    } else if (typeof result?.text === "string" && result.text) {
      responseText = result.text;
    }
  } catch (e) {
    // text 可能是 getter 並拋出錯誤
    context?.log?.warn?.("[Parse] result.text getter threw:", e.message);
  }

  // 路徑 2: response.text
  if (!responseText) {
    try {
      if (typeof result?.response?.text === "string" && result.response.text) {
        responseText = result.response.text;
      }
    } catch (e) {
      context?.log?.warn?.("[Parse] result.response.text threw:", e.message);
    }
  }

  // 路徑 3: 從 candidates 中提取
  if (!responseText) {
    const parts =
      result?.candidates?.[0]?.content?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];
    if (parts.length > 0) {
      responseText = parts.map((part) => part.text).filter(Boolean).join("\n");
    }
  }

  // Log 回應結構以利除錯
  if (!responseText) {
    context?.log?.error?.(
      "[Parse] Could not extract text from result. Keys:",
      Object.keys(result || {}),
      "Type:", typeof result
    );
    if (result?.candidates) {
      context?.log?.error?.(
        "[Parse] candidates[0]:", JSON.stringify(result.candidates[0])?.substring(0, 500)
      );
    }
    throw new Error("Empty response from AI (無法從回應中提取文字)");
  }

  context?.log?.("[Parse] responseText length:", responseText.length, "preview:", responseText.substring(0, 200));

  // 清理回應文字 — 移除 markdown 程式碼區塊標記
  let cleanText = responseText.trim();

  // 移除 ```json ... ``` 或 ``` ... ``` 包裝
  const codeBlockMatch = cleanText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (codeBlockMatch) {
    cleanText = codeBlockMatch[1].trim();
  }

  // 嘗試策略 1: 直接 JSON.parse
  try {
    return JSON.parse(cleanText);
  } catch (parseErr1) {
    context?.log?.warn?.("[Parse] Direct JSON.parse failed:", parseErr1.message);
  }

  // 嘗試策略 2: 找到最外層的 { ... } JSON 物件
  try {
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (parseErr2) {
    context?.log?.warn?.("[Parse] Extracted JSON parse failed:", parseErr2.message);
  }

  // 嘗試策略 3: 找到 [ ... ] JSON 陣列（有時模型只回傳陣列）
  try {
    const arrayMatch = cleanText.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const arr = JSON.parse(arrayMatch[0]);
      // 如果是場景陣列，包裝成標準格式
      if (Array.isArray(arr) && arr.length > 0 && arr[0].scene_number) {
        return { scenes: arr, title: "文件分析結果", summary: "" };
      }
      return arr;
    }
  } catch (parseErr3) {
    context?.log?.warn?.("[Parse] Array JSON parse failed:", parseErr3.message);
  }

  // 所有策略都失敗
  context?.log?.error?.("[Parse] All strategies failed. Text preview:", cleanText.substring(0, 500));
  throw new Error("無法從 AI 回應中解析 JSON，回應長度: " + responseText.length);
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
    const { documentUrl, fileName, contentType, base64Content, sceneCount } = req.body || {};
    context.log("[analyze-document] Step 2: Params -",
      "fileName:", fileName,
      "contentType:", contentType,
      "hasBase64:", !!base64Content,
      "base64Len:", base64Content?.length || 0,
      "hasUrl:", !!documentUrl,
      "sceneCount:", sceneCount || "auto"
    );

    // 驗證必要參數
    if (!documentUrl && !base64Content) {
      context.res = error("缺少文件內容（需提供 documentUrl 或 base64Content）", "bad_request", 400);
      return;
    }

    // 驗證檔案格式
    const mimeType = contentType || getMimeType(fileName);
    if (!isSupportedFormat(mimeType, fileName)) {
      context.res = error(
        `不支援的檔案格式。支援：PDF、DOCX、PPTX、TXT、MD、PNG、JPG`,
        "unsupported_format",
        400
      );
      return;
    }

    // 取得文件內容
    context.log("[analyze-document] Step 3: Prepare content, mimeType:", mimeType);
    let base64Data;
    let finalMimeType = mimeType;

    if (base64Content) {
      // 處理 Data URL 格式 (data:application/pdf;base64,xxxxx)
      if (base64Content.includes(",")) {
        base64Data = base64Content.split(",")[1];
        const mimeMatch = base64Content.match(/data:([^;]+);/);
        if (mimeMatch) {
          finalMimeType = mimeMatch[1];
        }
      } else {
        base64Data = base64Content;
      }
    } else if (documentUrl) {
      // 從 URL 獲取（傳入 fileName 以便 octet-stream 時可以回退推斷 MIME type）
      const fetched = await fetchDocumentAsBase64(documentUrl, fileName);
      base64Data = fetched.base64;
      // 若抓回來的 mimeType 仍是 octet-stream，再用 fileName 推斷一次
      finalMimeType = (fetched.contentType && fetched.contentType !== "application/octet-stream")
        ? fetched.contentType
        : getMimeType(fileName);
    }

    if (!base64Data) {
      context.res = error("無法取得文件內容", "document_fetch_failed", 400);
      return;
    }

    // 呼叫 Gemini 分析
    const modelName = process.env.GEMINI_MODEL_ANALYSIS || "gemini-3.0-flash";
    context.log("[analyze-document] Step 4: Call Gemini, model:", modelName, "finalMimeType:", finalMimeType);
    const model = getModel(modelName);

    // 對於文字檔案，直接傳送文字內容
    let contents;
    const analysisPrompt = buildAnalysisPrompt(sceneCount);
    if (finalMimeType === "text/plain") {
      let textContent = Buffer.from(base64Data, "base64").toString("utf-8");
      context.log("[analyze-document] Text content length:", textContent.length);

      // 防止輸入超出 token 限制（約每 4 字元 = 1 token）
      // 保留 30000 字元（≈7500 tokens）給輸入，剩餘 token 留給輸出
      const MAX_TEXT_CHARS = 30000;
      if (textContent.length > MAX_TEXT_CHARS) {
        context.log("[analyze-document] Text truncated from", textContent.length, "to", MAX_TEXT_CHARS, "chars");
        textContent = textContent.substring(0, MAX_TEXT_CHARS) + "\n\n[... 文件因長度截斷，請依以上內容進行分析 ...]";
      }

      contents = [
        {
          role: "user",
          parts: [
            { text: analysisPrompt },
            { text: `以下是文件內容：\n\n${textContent}` },
          ],
        },
      ];
    } else {
      // 對於二進位檔案，傳送 base64 圖片/文件
      contents = [
        {
          role: "user",
          parts: [
            { text: analysisPrompt },
            { inlineData: { mimeType: finalMimeType, data: base64Data } },
          ],
        },
      ];
    }

    let result;
    try {
      result = await model.generateContent(contents, {
        // 正確的 Google GenAI SDK config 結構
        responseMimeType: "application/json",
        // 增加 maxOutputTokens 防止大型 JSON 被截斷（10 個場景的 JSON 可能超過 8000 tokens）
        maxOutputTokens: 65535,
        temperature: 0.4, // 稍低隨機性以獲得更穩定的 JSON 輸出
      });
      context.log("[analyze-document] Step 5: Gemini responded, result keys:", Object.keys(result || {}));
    } catch (geminiErr) {
      context.log.error("[analyze-document] Gemini API error:", geminiErr.message);
      context.res = error(
        `AI 模型呼叫失敗：${geminiErr.message}`,
        "gemini_error",
        502
      );
      return;
    }

    // 解析回應
    let data;
    try {
      data = parseGeminiResponse(result, context);
      context.log("[analyze-document] Step 6: Parse OK, scenes:", data?.scenes?.length);
    } catch (parseErr) {
      context.log.error("[analyze-document] Parse error:", parseErr.message);
      context.res = error(
        `AI 回應格式異常：${parseErr.message}`,
        "parse_error",
        502
      );
      return;
    }

    // 驗證必要欄位
    // Gemini 有時會直接回傳 scenes 陣列而非物件
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

    // 確保每個場景都有必要欄位
    const validatedScenes = data.scenes.map((scene, index) => ({
      scene_number: scene.scene_number || index + 1,
      scene_title: scene.scene_title || `場景 ${index + 1}`,
      scene_description: scene.scene_description || "",
      visual_prompt: scene.visual_prompt || scene.scene_description || "",
      key_elements: scene.key_elements || [],
      mood: scene.mood || "",
      source_text: scene.source_text || "",
    }));

    // 確保角色資訊存在
    const validatedCharacters = (data.characters || []).map((char) => ({
      name: char.name || "未命名角色",
      description: char.description || "",
      consistency_prompt: char.consistency_prompt || "",
    }));

    // 回傳標準化結果
    const response = {
      title: data.title || fileName || "未命名文件",
      summary: data.summary || "",
      content_type: data.content_type || "document",
      page_count: data.page_count || validatedScenes.length,
      scenes: validatedScenes,
      characters: validatedCharacters,
      total_scenes: validatedScenes.length,
      estimated_generation_time: validatedScenes.length * 15,
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
