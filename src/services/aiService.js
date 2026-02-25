import { API_BASE_URL } from "../config";
import { apiPost } from "./apiClient";

export const analyzeStyle = async ({ referencePreview, imageUrl }) =>
  apiPost(`${API_BASE_URL}/analyze-style`, { referencePreview, imageUrl });

export const generateImage = async ({ prompt, aspectRatio, imageSize, imageUrl }) =>
  apiPost(`${API_BASE_URL}/generate-images`, { prompt, aspectRatio, imageSize, imageUrl });

export const embedText = async ({ text }) =>
  apiPost(`${API_BASE_URL}/embeddings`, { text });

export const optimizePrompt = async ({ userScript, styleContext }) =>
  apiPost(`${API_BASE_URL}/optimize-prompt`, { userScript, styleContext });

/**
 * 分析文件內容並提取分鏡腳本
 * @param {Object} params
 * @param {string} params.documentUrl - 文件在 Blob Storage 的 URL
 * @param {string} params.fileName - 檔案名稱
 * @param {string} params.contentType - MIME 類型
 * @param {string} params.base64Content - Base64 編碼的文件內容（可選）
 * @returns {Promise<Object>} 包含 title, summary, scenes, characters 的分析結果
 */
export const analyzeDocument = async ({ documentUrl, fileName, contentType, base64Content, sceneCount }) =>
  apiPost(`${API_BASE_URL}/analyze-document`, { documentUrl, fileName, contentType, base64Content, sceneCount });

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
