import { API_BASE_URL } from "../config";
import { inferDocumentMimeType } from "../lib/documentFormats";
import { apiDelete, apiGet, apiPost, apiPut } from "./apiClient";

export const listHistory = async () =>
  apiGet(`${API_BASE_URL}/history`);

const buildQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      if (value.length > 0) query.set(key, value.join(","));
      return;
    }
    query.set(key, String(value));
  });
  const text = query.toString();
  return text ? `?${text}` : "";
};

export const listStyles = async (params) =>
  apiGet(`${API_BASE_URL}/styles${buildQueryString(params)}`);

export const addStyle = async (styleData) =>
  apiPost(`${API_BASE_URL}/styles`, styleData);

export const updateStyle = async (styleId, styleData) =>
  apiPut(`${API_BASE_URL}/styles/${styleId}`, styleData);

export const deleteStyle = async (styleId) =>
  apiDelete(`${API_BASE_URL}/styles/${styleId}`);

export const publishStyle = async (styleId) =>
  apiPost(`${API_BASE_URL}/styles/${styleId}/publish`);

export const unpublishStyle = async (styleId) =>
  apiPost(`${API_BASE_URL}/styles/${styleId}/unpublish`);

export const copyStyle = async (styleId) =>
  apiPost(`${API_BASE_URL}/styles/${styleId}/copy`);

export const markStyleUsed = async (styleId) =>
  apiPost(`${API_BASE_URL}/styles/${styleId}/use`);

export const addHistoryItem = async (itemData) =>
  apiPost(`${API_BASE_URL}/history`, itemData);

export const deleteHistoryItem = async (itemId) =>
  apiDelete(`${API_BASE_URL}/history/${itemId}`);

export const searchStylesByEmbedding = async ({ embedding, topK }) =>
  apiPost(`${API_BASE_URL}/styles/search`, { embedding, topK });

const invalidUploadGrant = () => new Error("Invalid upload grant");

const validateUploadGrant = (grant) => {
  const requiredStrings = [
    grant?.uploadId,
    grant?.status,
    grant?.blobUrl,
    grant?.sasToken,
    grant?.expiresAt,
  ];

  if (
    requiredStrings.some((value) => typeof value !== "string" || value.length === 0) ||
    grant.status !== "pending"
  ) {
    throw invalidUploadGrant();
  }

  try {
    new URL(grant.blobUrl);
  } catch {
    throw invalidUploadGrant();
  }

  return grant;
};

export const createUpload = async ({ fileName, contentType, sizeBytes, purpose }) =>
  validateUploadGrant(
    await apiPost(`${API_BASE_URL}/uploads`, {
      fileName,
      contentType,
      sizeBytes,
      purpose,
    })
  );

export const putUploadBytes = async ({ blobUrl, sasToken, file }) => {
  if (typeof blobUrl !== "string" || !blobUrl || typeof sasToken !== "string" || !sasToken) {
    throw invalidUploadGrant();
  }

  const uploadUrl = `${blobUrl}${sasToken.startsWith("?") ? "" : "?"}${sasToken}`;
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }
};

export const completeUpload = async (uploadId) =>
  apiPost(`${API_BASE_URL}/uploads/${uploadId}/complete`);

export const uploadFile = async (file, purpose) => {
  const contentType = purpose === "document" ? inferDocumentMimeType(file) : file.type;
  const grant = await createUpload({
    fileName: file.name,
    contentType,
    sizeBytes: file.size,
    purpose,
  });

  await putUploadBytes({
    blobUrl: grant.blobUrl,
    sasToken: grant.sasToken,
    file,
  });

  const completion = await completeUpload(grant.uploadId);
  if (completion?.uploadId !== grant.uploadId || completion?.status !== "ready") {
    throw new Error("Invalid upload completion");
  }

  return {
    uploadId: completion.uploadId,
    status: "ready",
  };
};

export const uploadFileToBlob = (file, ignoredContainer) => {
  void ignoredContainer;
  return uploadFile(file, "document");
};

export const requestBlobSas = async () => {
  const error = new Error("upload_api_replaced");
  error.code = "upload_api_replaced";
  throw error;
};

// ── Templates API ──

export const listTemplates = async (category) =>
  apiGet(`${API_BASE_URL}/templates${category ? `?category=${category}` : ''}`);

export const addTemplate = async (templateData) =>
  apiPost(`${API_BASE_URL}/templates`, templateData);

export const updateTemplate = async (id, templateData) =>
  apiPut(`${API_BASE_URL}/templates/${id}`, templateData);

export const deleteTemplate = async (templateId) =>
  apiDelete(`${API_BASE_URL}/templates/${templateId}`);
