import { API_BASE_URL } from "../config";
import { apiPost } from "./apiClient";
import { generateImageGpt, editImageGpt } from "./gptImageService";

export const analyzeStyle = async ({ referencePreview, imageUrl }) =>
  apiPost(`${API_BASE_URL}/analyze-style`, { referencePreview, imageUrl });

export const generateImage = async ({ prompt, aspectRatio, imageSize, imageUrl, model, signal }) => {
  if (model === "gpt-image-2") {
    return generateImageGpt({ prompt, aspectRatio, signal });
  }
  return apiPost(`${API_BASE_URL}/generate-images`, { prompt, aspectRatio, imageSize, imageUrl });
};

export const embedText = async ({ text }) =>
  apiPost(`${API_BASE_URL}/embeddings`, { text });

export const optimizePrompt = async ({ userScript, styleContext }) =>
  apiPost(`${API_BASE_URL}/optimize-prompt`, { userScript, styleContext });

export const generateFilename = async ({ userScript }) =>
  apiPost(`${API_BASE_URL}/generate-filename`, { userScript });

/**
 * 分析文件內容並提取分鏡腳本或簡報投影片
 * @param {Object} params
 * @param {string} params.documentUrl - 文件在 Blob Storage 的 URL
 * @param {string} params.fileName - 檔案名稱
 * @param {string} params.contentType - MIME 類型
 * @param {string} params.base64Content - Base64 編碼的文件內容（可選）
 * @param {number|'auto'} params.sceneCount - 場景/投影片數量
 * @param {'storyboard'|'presentation'} params.mode - 分析模式
 * @returns {Promise<Object>} 包含 title, summary, scenes, characters 的分析結果
 */
export const analyzeDocument = async ({ documentUrl, fileName, contentType, base64Content, sceneCount, mode }) =>
  apiPost(`${API_BASE_URL}/analyze-document`, { documentUrl, fileName, contentType, base64Content, sceneCount, mode });

/**
 * AI 優化單一場景的標題、描述和英文 Prompt
 * @param {Object} params
 * @param {string} params.scene_title - 場景標題
 * @param {string} params.scene_description - 場景描述
 * @param {string} params.visual_prompt - 英文 Prompt
 * @param {string} params.mood - 氛圍
 * @param {string[]} params.key_elements - 關鍵元素
 * @param {string} params.styleContext - 風格上下文（可選）
 * @returns {Promise<Object>} 優化後的場景資料
 */
export const optimizeScene = async ({ scene_title, scene_description, visual_prompt, mood, key_elements, styleContext }) =>
  apiPost(`${API_BASE_URL}/optimize-scene`, { scene_title, scene_description, visual_prompt, mood, key_elements, styleContext });

/**
 * AI 圖片轉換 — 支援 Gemini（後端）和 GPT-Image-2（前端 edit API）
 * @param {Object} params
 * @param {string} params.imageDataUrl - 來源圖片 base64 data URL
 * @param {string} [params.imageBlobSasUrl] - 來源圖片 Blob SAS URL（Gemini 路徑優先使用）
 * @param {string} params.mimeType - 圖片 MIME 類型
 * @param {'style_transfer'|'reference_gen'|'element_extract'|'bg_replace'} params.mode - 轉換模式
 * @param {string} params.prompt - 使用者自訂描述
 * @param {string} [params.aspectRatio] - 圖片比例
 * @param {string} [params.imageSize] - 圖片尺寸（Gemini）
 * @param {'gemini-imagen'|'gpt-image-2'} params.model - AI 模型
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{imageUrl: string}>}
 */
export const transformImage = async ({
  imageDataUrl,
  imageBlobSasUrl,
  mimeType,
  mode,
  prompt,
  aspectRatio,
  imageSize,
  model,
  signal,
}) => {
  if (model === "gpt-image-2") {
    return editImageGpt({ imageDataUrl, prompt, aspectRatio, signal });
  }
  // Gemini：透過後端 Azure Function
  const imageBase64 = imageDataUrl ? imageDataUrl.split(",")[1] : null;
  return apiPost(`${API_BASE_URL}/image-transform`, {
    imageBase64,
    imageUrl: imageBlobSasUrl || null,
    mimeType,
    mode,
    prompt,
    aspectRatio,
    imageSize,
  });
};
