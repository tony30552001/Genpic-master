import { GPT_IMAGE_ENDPOINT, GPT_IMAGE_API_KEY } from "../config";
import { acquireAccessToken } from "./authService";
import { AUTH_BYPASS } from "../config";

/**
 * aspectRatio → gpt-image-2 pixel size 映射
 */
const ASPECT_RATIO_TO_SIZE = {
  "1:1": "1024x1024",
  "16:9": "1536x1024",
  "4:3": "1536x1024",
  "9:16": "1024x1536",
};

/**
 * 取得 Authorization header
 * 優先使用 API Key，否則使用 MSAL token
 */
const getAuthHeader = async () => {
  if (GPT_IMAGE_API_KEY) {
    return `Bearer ${GPT_IMAGE_API_KEY}`;
  }
  if (!AUTH_BYPASS) {
    const token = await acquireAccessToken();
    if (!token) throw new Error("登入已過期，請重新登入");
    return `Bearer ${token}`;
  }
  return "";
};

/**
 * 呼叫 Azure AI Foundry GPT-Image-2 endpoint
 * @param {Object} params
 * @param {string} params.prompt - 圖片描述 prompt
 * @param {string} params.aspectRatio - 比例 (1:1, 16:9, 4:3, 9:16)
 * @param {AbortSignal} [params.signal] - 用於取消前端等待中的生成請求
 * @returns {Promise<{imageUrl: string}>} 統一回傳格式
 */
export async function generateImageGpt({ prompt, aspectRatio = "1:1", signal } = {}) {
  if (!GPT_IMAGE_ENDPOINT) {
    throw new Error("GPT Image 2 endpoint 尚未設定，請配置 VITE_GPT_IMAGE_ENDPOINT 環境變數。");
  }

  const size = ASPECT_RATIO_TO_SIZE[aspectRatio] || "1024x1024";
  const authHeader = await getAuthHeader();

  const response = await fetch(GPT_IMAGE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    },
    body: JSON.stringify({
      prompt,
      model: "gpt-image-2",
      size,
      n: 1,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `GPT Image 2 請求失敗 (${response.status})`;
    try {
      const json = JSON.parse(text);
      message = json?.error?.message || json?.message || message;
    } catch {
      if (text) message = text;
    }
    throw new Error(message);
  }

  const data = await response.json();

  const b64 = data?.data?.[0]?.b64_json;
  const url = data?.data?.[0]?.url;
  if (!b64 && !url) {
    throw new Error("GPT Image 2 回傳格式異常：缺少圖片資料。");
  }

  return { imageUrl: b64 ? `data:image/png;base64,${b64}` : url };
}
