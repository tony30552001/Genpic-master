const { StorageSharedKeyCredential } = require("@azure/storage-blob");

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { getModel } = require("../_shared/gemini");
const { rateLimit } = require("../_shared/rateLimit");

/**
 * 文件分析的系統提示詞
 * 要求 Gemini 分析文件內容並回傳結構化的分鏡腳本
 */
const DOCUMENT_ANALYSIS_PROMPT = `請擔任專業的文件分析師與視覺導演。請深入分析所提供的文件內容，並回傳一個 JSON 物件，包含以下欄位：

1. "title": (string) 文件的標題或主題
2. "summary": (string, 繁體中文) 文件的整體摘要，100-200字
3. "scenes": (array of objects) 分鏡腳本陣列，每個場景包含：
   - "scene_number": (number) 場景編號
   - "scene_title": (string, 繁體中文) 場景標題（簡短描述）
   - "scene_description": (string, 繁體中文) 詳細的場景描述，包含人物動作、表情、場景細節
   - "visual_prompt": (string, 英文) 專門用於 AI 圖片生成的英文 Prompt，需詳細描述構圖、風格、光影
   - "key_elements": (array of strings) 場景中的關鍵視覺元素（人物、物品、場景特徵）
   - "mood": (string, 繁體中文) 場景情緒氛圍（如：溫馨、緊張、專業、歡樂）
   
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
- 如果是文章/報告，每個重要段落對應一個場景`;

/**
 * 從 Azure Blob Storage 直接下載文件（使用 SDK，不受公共存取設定影響）
 * @param {string} documentUrl - Blob URL，格式: https://<account>.blob.core.windows.net/<container>/<blobName>
 * @returns {{ base64: string, contentType: string }}
 */
const fetchDocumentAsBase64 = async (documentUrl) => {
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
      const contentType =
        downloadResponse.contentType || "application/pdf";

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
  const contentType = response.headers.get("content-type") || "application/pdf";
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
const parseGeminiResponse = (result) => {
  // 嘗試多種路徑找到文字內容
  let responseText = "";

  if (result?.text) {
    responseText = result.text;
  } else if (result?.response?.text) {
    responseText = result.response.text;
  } else {
    const parts =
      result?.candidates?.[0]?.content?.parts ||
      result?.response?.candidates?.[0]?.content?.parts ||
      [];
    if (parts.length > 0) {
      responseText = parts.map((part) => part.text).filter(Boolean).join("\n");
    }
  }

  if (!responseText) {
    throw new Error("Empty response from AI");
  }

  // 嘗試直接解析 JSON
  try {
    return JSON.parse(responseText);
  } catch (parseErr) {
    // 嘗試從文字中提取 JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("無法從 AI 回應中解析 JSON");
    }
    return JSON.parse(jsonMatch[0]);
  }
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  // 驗證身份
  const auth = await requireAuth(context, req);
  if (!auth) return;

  // 速率限制
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  // 取得請求參數
  const { documentUrl, fileName, contentType, base64Content } = req.body || {};

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

  try {
    // 取得文件內容
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
      // 從 URL 獲取
      const fetched = await fetchDocumentAsBase64(documentUrl);
      base64Data = fetched.base64;
      finalMimeType = fetched.contentType;
    }

    if (!base64Data) {
      context.res = error("無法取得文件內容", "document_fetch_failed", 400);
      return;
    }

    // 呼叫 Gemini 分析 - 使用 Pro 模型獲得更高品質分析
    const modelName = process.env.GEMINI_MODEL_ANALYSIS || "gemini-1.5-pro";
    const model = getModel(modelName);

    // 對於文字檔案，直接傳送文字內容
    let contents;
    if (finalMimeType === "text/plain") {
      const textContent = Buffer.from(base64Data, "base64").toString("utf-8");
      contents = [
        {
          role: "user",
          parts: [
            { text: DOCUMENT_ANALYSIS_PROMPT },
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
            { text: DOCUMENT_ANALYSIS_PROMPT },
            { inlineData: { mimeType: finalMimeType, data: base64Data } },
          ],
        },
      ];
    }

    const result = await model.generateContent(contents, {
      responseMimeType: "application/json",
    });

    // 解析回應
    let data;
    try {
      data = parseGeminiResponse(result);
    } catch (parseErr) {
      context.log.error("Parse error:", parseErr.message);
      context.res = error("AI 回應格式異常，請重試", "parse_error", 502);
      return;
    }

    // 驗證必要欄位
    if (!data.scenes || !Array.isArray(data.scenes)) {
      context.res = error("AI 回應缺少場景資訊", "invalid_response", 502);
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
      estimated_generation_time: validatedScenes.length * 15, // 預估每張15秒
    };

    context.res = ok(response);
  } catch (err) {
    context.log.error("Document analysis error:", err.message);
    context.log.error("Error stack:", err.stack);
    context.res = error(
      err.message || "文件分析失敗，請稍後重試",
      "analysis_failed",
      502
    );
  }
};
