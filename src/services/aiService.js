import { API_BASE_URL } from "../config";
import { apiPost } from "./apiClient";

export const analyzeStyle = async ({ referencePreview, imageUrl }) =>
  apiPost(`${API_BASE_URL}/analyze-style`, { referencePreview, imageUrl });

export const generateImage = async ({ prompt, aspectRatio, imageSize }) =>
  apiPost(`${API_BASE_URL}/generate-images`, { prompt, aspectRatio, imageSize });

export const embedText = async ({ text }) =>
  apiPost(`${API_BASE_URL}/embeddings`, { text });
