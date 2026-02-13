import { API_BASE_URL } from "../config";
import { apiPost } from "./apiClient";

export const analyzeStyle = async ({ referencePreview, imageUrl }) =>
  apiPost(`${API_BASE_URL}/analyze-style`, { referencePreview, imageUrl });

export const generateImage = async ({ prompt, aspectRatio, imageSize, imageUrl }) =>
  apiPost(`${API_BASE_URL}/generate-images`, { prompt, aspectRatio, imageSize, imageUrl });

export const embedText = async ({ text }) =>
  apiPost(`${API_BASE_URL}/embeddings`, { text });

/**
 * 分析文件內容並提取分鏡腳本
 * @param {Object} params
 * @param {string} params.documentUrl - 文件在 Blob Storage 的 URL
 * @param {string} params.fileName - 檔案名稱
 * @param {string} params.contentType - MIME 類型
 * @param {string} params.base64Content - Base64 編碼的文件內容（可選）
 * @returns {Promise<Object>} 包含 title, summary, scenes, characters 的分析結果
 */
export const analyzeDocument = async ({ documentUrl, fileName, contentType, base64Content }) =>
  apiPost(`${API_BASE_URL}/analyze-document`, { documentUrl, fileName, contentType, base64Content });
