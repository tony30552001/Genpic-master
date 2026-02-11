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
