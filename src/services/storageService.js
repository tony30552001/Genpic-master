import { API_BASE_URL } from "../config";
import { apiDelete, apiGet, apiPost } from "./apiClient";

export const listHistory = async () =>
  apiGet(`${API_BASE_URL}/history`);

export const listStyles = async () =>
  apiGet(`${API_BASE_URL}/styles`);

export const addStyle = async (styleData) =>
  apiPost(`${API_BASE_URL}/styles`, styleData);

export const deleteStyle = async (styleId) =>
  apiDelete(`${API_BASE_URL}/styles/${styleId}`);

export const addHistoryItem = async (itemData) =>
  apiPost(`${API_BASE_URL}/history`, itemData);

export const deleteHistoryItem = async (itemId) =>
  apiDelete(`${API_BASE_URL}/history/${itemId}`);

export const searchStylesByEmbedding = async ({ embedding, topK }) =>
  apiPost(`${API_BASE_URL}/styles/search`, { embedding, topK });

export const requestBlobSas = async ({ fileName, contentType, container }) =>
  apiPost(`${API_BASE_URL}/blob-sas`, { fileName, contentType, container });

export const uploadBlob = async ({ blobUrl, sasToken, file, contentType }) => {
  const uploadUrl = `${blobUrl}?${sasToken}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Upload failed: ${response.status}`);
  }

  return blobUrl;
};

/**
 * 上傳檔案到 Blob Storage
 * 完整流程：取得 SAS Token → 上傳檔案
 * @param {File} file - 要上傳的檔案
 * @param {string} container - Blob 容器名稱 (預設: uploads)
 * @returns {Promise<{url: string, blobName: string}>}
 */
export const uploadFileToBlob = async (file, container = "uploads") => {
  // 步驟 1: 請求 SAS Token
  const sasResult = await requestBlobSas({
    fileName: file.name,
    contentType: file.type,
    container,
  });

  if (!sasResult?.blobUrl || !sasResult?.sasToken) {
    throw new Error("無法取得上傳授權");
  }

  // 步驟 2: 上傳檔案
  await uploadBlob({
    blobUrl: sasResult.blobUrl,
    sasToken: sasResult.sasToken,
    file,
    contentType: file.type,
  });

  return {
    url: sasResult.blobUrl,
    blobName: sasResult.blobName,
  };
};
