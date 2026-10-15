import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeStyle,
  generateImage,
  generateFilename,
  transformImage,
  waitForImageJob,
} from "../services/aiService";
import { getGenerationStatus } from "../utils/generationProgress";
import { requireImageJobAdmission, requireCompletedImageJob } from "../lib/imageJob";

const normalizeTags = (raw) => {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === "string" && raw.trim()) {
    return raw.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  }
  return [];
};

const safeString = (v, fallback = "") =>
  v == null ? fallback : typeof v === "string" ? v : String(v);

const isAbortError = (error) =>
  error?.name === "AbortError" || error?.code === 20;

export default function useImageGeneration() {
  const [analyzedStyle, setAnalyzedStyle] = useState("");
  const [analysisResultData, setAnalysisResultData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generatedFilename, setGeneratedFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(""); // 新增：分析階段狀態
  const [generationStartedAt, setGenerationStartedAt] = useState(null);
  const [generationElapsedSeconds, setGenerationElapsedSeconds] = useState(0);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    if (!isGenerating || !generationStartedAt) return undefined;

    const updateElapsedSeconds = () => {
      setGenerationElapsedSeconds(Math.floor((Date.now() - generationStartedAt) / 1000));
    };

    updateElapsedSeconds();
    const timerId = window.setInterval(updateElapsedSeconds, 1000);

    return () => window.clearInterval(timerId);
  }, [generationStartedAt, isGenerating]);

  const generationStatus = useMemo(
    () => getGenerationStatus({ elapsedSeconds: generationElapsedSeconds }),
    [generationElapsedSeconds]
  );

  const runStyleAnalysis = useCallback(async ({ referenceUploadId }) => {
    if (!referenceUploadId) {
      throw new Error("請先上傳參考圖片。");
    }

    setIsAnalyzing(true);
    setAnalysisPhase("上傳圖片並準備分析...");

    try {
      setAnalysisPhase("AI 正在解析風格特徵（約需 5-10 秒）...");
      const result = await analyzeStyle({
        referenceUploadId,
      });

      setAnalysisPhase("儲存分析結果...");
      const normalized = {
        ...result,
        style_prompt: safeString(result.style_prompt),
        style_description_zh: safeString(result.style_description_zh),
        image_content: safeString(result.image_content),
        style_name: safeString(result.style_name),
        suggested_tags: normalizeTags(result.suggested_tags),
      };
      setAnalyzedStyle(normalized.style_prompt || "");
      setAnalysisResultData(normalized);
      setAnalysisPhase("");
      return normalized;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /**
   * Shared lifecycle for every image job started from the creation workspace or
   * the storyboard: one abort controller, one progress clock, one preview.
   */
  const runImageJob = useCallback(
    async ({ admit, operation, filenameSource, updatePreview }) => {
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const startedAt = Date.now();

      setIsGenerating(true);
      setGenerationStartedAt(startedAt);
      setGenerationElapsedSeconds(0);
      setGeneratedFilename("");
      if (updatePreview) setGeneratedImage(null);

      try {
        // 檔名在背景產生，不阻擋主流程
        const fallbackFilename = `genpic-${Date.now()}`;
        const filenamePromise = generateFilename({ userScript: filenameSource })
          .then(res => {
            const filename = res?.filename || fallbackFilename;
            setGeneratedFilename(filename);
            return filename;
          })
          .catch(err => {
            console.warn("Filename generation failed in background, using fallback", err);
            setGeneratedFilename(fallbackFilename);
            return fallbackFilename;
          });

        const admission = requireImageJobAdmission(await admit(abortController.signal));
        const result = requireCompletedImageJob(
          await waitForImageJob({
            jobId: admission.jobId,
            signal: abortController.signal,
          }),
          { jobId: admission.jobId, model: admission.model, operation }
        );

        if (updatePreview) {
          setGeneratedImage(result.imageUrl);
        }
        return {
          jobId: result.jobId,
          imageUrl: result.imageUrl,
          finalPrompt: admission.prompt || "",
          filenamePromise,
          model: result.model,
        };
      } catch (err) {
        if (isAbortError(err)) {
          const abortError = new Error("已取消本次生成等待。若服務端已開始處理，可能仍會消耗請求。");
          abortError.name = "AbortError";
          throw abortError;
        }
        throw err;
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
          setIsGenerating(false);
          setGenerationStartedAt(null);
        }
      }
    },
    []
  );

  const runGeneration = useCallback(
    async ({ userScript, analyzedStyle: stylePrompt, styleTags, purpose, aspectRatio, imageQuality, imageLanguage, referenceUploadId, updatePreview = true }) => {
      if (!userScript) {
        throw new Error("請輸入您想要生成的內容或劇情。");
      }

      // 最終 prompt 由後端的 api/_shared/imagePrompt.js 組裝，前端只送出創作輸入
      return runImageJob({
        admit: (signal) => generateImage({
          userScript,
          stylePrompt,
          styleTags,
          purpose,
          imageLanguage,
          aspectRatio,
          imageQuality,
          referenceUploadId,
          signal,
        }),
        operation: referenceUploadId ? "edit" : "generate",
        filenameSource: userScript,
        updatePreview,
      });
    },
    [runImageJob]
  );

  const runTransform = useCallback(
    async ({ uploadId, mode, prompt, stylePrompt, styleTags, aspectRatio, imageQuality, imageLanguage, filenameSource }) => {
      if (!uploadId) {
        throw new Error("請先附上要轉換的圖片。");
      }

      return runImageJob({
        admit: (signal) => transformImage({
          uploadId,
          mode,
          prompt,
          stylePrompt,
          styleTags,
          aspectRatio,
          imageQuality,
          imageLanguage,
          signal,
        }),
        operation: "edit",
        filenameSource: filenameSource || prompt,
        updatePreview: true,
      });
    },
    [runImageJob]
  );
  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearStyle = useCallback(() => {
    setAnalyzedStyle("");
    setAnalysisResultData(null);
  }, []);

  return {
    analyzedStyle,
    analysisResultData,
    generatedImage,
    generatedFilename, // 匯出產生的檔名
    isAnalyzing,
    isGenerating,
    analysisPhase,
    generationStatus,
    analyzeStyle: runStyleAnalysis,
    generateImage: runGeneration,
    transformImage: runTransform,
    cancelGeneration,
    clearStyle,
    setAnalyzedStyle,
    setAnalysisResultData,
    setGeneratedImage,
  };
}
