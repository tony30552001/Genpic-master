import { API_BASE_URL } from "../config";
import { apiGet, apiGetBlob, apiPost } from "./apiClient";
import {
  requireImageJobId,
  requireImageJobAdmission,
  requireImageJob,
  requireCompletedImageJob,
} from "../lib/imageJob";

export const analyzeStyle = async ({ referenceUploadId }) =>
  apiPost(`${API_BASE_URL}/analyze-style`, { referenceUploadId });

export const generateImage = async ({
  userScript,
  stylePrompt,
  styleTags,
  purpose,
  imageLanguage,
  aspectRatio,
  imageQuality,
  referenceUploadId,
  signal,
}) => {
  return requireImageJobAdmission(await apiPost(
    `${API_BASE_URL}/generate-images`,
    {
      userScript,
      stylePrompt,
      styleTags,
      purpose,
      imageLanguage,
      aspectRatio,
      quality: imageQuality,
      referenceUploadId,
    },
    { signal }
  ));
};

export const getImageJob = async ({ jobId, signal }) =>
  apiGet(`${API_BASE_URL}/image-jobs/${encodeURIComponent(jobId)}`, { signal });

const abortableDelay = (durationMs, signal) =>
  new Promise((resolve, reject) => {
    const timerApi = globalThis;
    if (signal?.aborted) {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      reject(error);
      return;
    }

    let timerId;
    const abort = () => {
      timerApi.clearTimeout(timerId);
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      reject(error);
    };

    timerId = timerApi.setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, durationMs);
    signal?.addEventListener("abort", abort, { once: true });
  });

export const waitForImageJob = async ({
  jobId,
  signal,
  pollIntervalMs = 2000,
  timeoutMs = 20 * 60 * 1000,
}) => {
  requireImageJobId(jobId);
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    const job = requireImageJob(await getImageJob({ jobId, signal }), { jobId });
    if (job.status === "succeeded") return requireCompletedImageJob(job, { jobId });
    if (job?.status === "failed") {
      throw new Error(job.error?.message || "圖片生成失敗，請稍後重試");
    }

    await abortableDelay(pollIntervalMs, signal);
  }

  throw new Error("圖片生成工作逾時，請稍後重試");
};

export const embedText = async ({ text }) =>
  apiPost(`${API_BASE_URL}/embeddings`, { text });

export const optimizePrompt = async ({
  userScript,
  styleContext,
  imageLanguage,
  imagePurpose,
  aspectRatio,
  optimizationMode,
  transformMode,
}) => apiPost(`${API_BASE_URL}/optimize-prompt`, {
  userScript,
  styleContext,
  imageLanguage,
  imagePurpose,
  aspectRatio,
  optimizationMode,
  transformMode,
});

export const generateFilename = async ({ userScript }) =>
  apiPost(`${API_BASE_URL}/generate-filename`, { userScript });

export const listPptTemplates = async ({ signal } = {}) =>
  apiGet(`${API_BASE_URL}/ppt-templates`, { signal });

export const createDeckJob = async ({
  topic,
  sourceUploadId,
  fileName,
  slideCount,
  imageDensity,
  styleId,
  layoutId,
  recipeId,
  briefPurpose,
  briefAudience,
  briefOutcome,
  signal,
}) =>
  apiPost(
    `${API_BASE_URL}/deck-jobs`,
    {
      topic,
      sourceUploadId,
      fileName,
      slideCount,
      imageDensity,
      styleId,
      layoutId,
      recipeId,
      briefPurpose,
      briefAudience,
      briefOutcome,
    },
    { signal }
  );

export const getDeckJob = async ({ jobId, signal }) =>
  apiGet(`${API_BASE_URL}/deck-jobs/${encodeURIComponent(jobId)}`, { signal });

export const downloadDeckJobPptx = async ({ jobId, signal }) =>
  apiGetBlob(`${API_BASE_URL}/deck-jobs/${encodeURIComponent(jobId)}/download`, {
    signal,
  });

/**
 * 取得單頁投影片的 SVG 預覽。
 * 走 apiClient 而不是直接把網址塞進 <img src>，才能沿用既有的 cookie 認證、
 * 重試與 AuthExpiredError 處理（開發環境的 API 可能不同來源）。
 */
export const getDeckSlidePreview = async ({ jobId, slideNumber, signal }) =>
  apiGetBlob(
    `${API_BASE_URL}/deck-jobs/${encodeURIComponent(jobId)}/slides/${encodeURIComponent(
      slideNumber
    )}`,
    { signal }
  );

/**
 * 輪詢簡報生成工作，直到成功或失敗。
 * 每頁投影片都要經過 LLM 手寫 SVG 與品質閘門，因此逾時設定得比圖片長。
 * 生成期間使用者可能休眠電腦或切換網路，單次輪詢失敗不代表工作失敗，
 * 因此連續失敗超過 MAX_POLL_FAILURES 次才視為中斷；伺服器上的工作狀態永遠是權威。
 */
const MAX_POLL_FAILURES = 5;

export const waitForDeckJob = async ({
  jobId,
  signal,
  onProgress,
  pollIntervalMs = 4000,
  timeoutMs = 40 * 60 * 1000,
}) => {
  const startedAt = Date.now();
  let consecutiveFailures = 0;

  while (Date.now() - startedAt <= timeoutMs) {
    let job;
    try {
      job = await getDeckJob({ jobId, signal });
      consecutiveFailures = 0;
    } catch (pollError) {
      if (
        pollError?.name === "AbortError" ||
        pollError?.name === "AuthExpiredError" ||
        pollError?.status === 404
      ) {
        throw pollError;
      }
      consecutiveFailures += 1;
      if (consecutiveFailures >= MAX_POLL_FAILURES) throw pollError;
      await abortableDelay(pollIntervalMs, signal);
      continue;
    }

    onProgress?.(job);

    if (job?.status === "succeeded") return job;
    if (job?.status === "failed") {
      const failure = new Error(job.error?.message || "簡報生成失敗，請稍後重試");
      failure.jobFailed = true;
      failure.code = job.error?.code || "deck_generation_failed";
      throw failure;
    }

    await abortableDelay(pollIntervalMs, signal);
  }

  throw new Error("簡報生成工作逾時，請稍後重試");
};

/**
 * AI 圖片轉換 — 透過後端影像工作佇列使用目前模型
 * @param {Object} params
 * @param {string} params.uploadId - 來源圖片的 owner-scoped upload ID
 * @param {string} params.mimeType - 圖片 MIME 類型
 * @param {'refine'|'style_transfer'|'reference_gen'|'element_extract'|'bg_replace'} params.mode - 轉換模式
 * @param {string} params.prompt - 使用者自訂描述
 * @param {string} [params.stylePrompt] - 風格庫提供的共用風格描述
 * @param {string[]} [params.styleTags] - 調色盤的補充風格線索
 * @param {string} [params.aspectRatio] - 圖片比例
 * @param {string} [params.imageQuality] - 模型目錄支援的圖片品質
 * @param {string} [params.imageLanguage] - 圖片內文字語系
 * @param {string} [params.maskUploadId] - 精確編輯遮罩的 upload ID（僅 refine；透明區域為要修改處）
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{jobId: string, status: 'queued', model: string, prompt: string}>}
 */
export const transformImage = async ({
  uploadId,
  mimeType,
  mode,
  prompt,
  stylePrompt,
  styleTags,
  aspectRatio,
  imageQuality,
  imageLanguage,
  maskUploadId,
  signal,
}) => {
  return requireImageJobAdmission(await apiPost(
    `${API_BASE_URL}/image-transform`,
    {
      uploadId,
      mimeType,
      mode,
      prompt,
      stylePrompt,
      styleTags,
      aspectRatio,
      quality: imageQuality,
      imageLanguage,
      maskUploadId,
    },
    { signal }
  ));
};
