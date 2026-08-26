import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  analyzeStyle,
  generateImage,
  generateFilename,
  waitForImageJob,
} from "../services/aiService";
import { getGenerationStatus } from "../utils/generationProgress";
import { DEFAULT_IMAGE_MODEL } from "../config";

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
  const [generationModel, setGenerationModel] = useState(DEFAULT_IMAGE_MODEL);
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
    () => getGenerationStatus({ elapsedSeconds: generationElapsedSeconds, model: generationModel }),
    [generationElapsedSeconds, generationModel]
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

  const runGeneration = useCallback(
    async ({
      userScript,
      analyzedStyle: stylePrompt,
      styleTags,
      purpose,
      templateContext,
      aspectRatio,
      imageSize,
      imageQuality,
      imageLanguage,
      referenceUploadId,
      model,
      updatePreview = true,
    }) => {
      if (!userScript) {
        throw new Error("請輸入您想要生成的內容或劇情。");
      }

      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      const startedAt = Date.now();

      setIsGenerating(true);
      setGenerationStartedAt(startedAt);
      setGenerationElapsedSeconds(0);
      setGenerationModel(model || DEFAULT_IMAGE_MODEL);
      setGeneratedFilename("");
      if (updatePreview) setGeneratedImage(null);

      try {
        // 同步發起檔名產生的 Request（不去 await 阻擋主流程，放到背景執行）
        const fallbackFilename = `genpic-${Date.now()}`;
        const filenamePromise = generateFilename({ userScript })
          .then(res => {
            if (res && res.filename) {
              setGeneratedFilename(res.filename);
              return res.filename;
            } else {
              setGeneratedFilename(fallbackFilename);
              return fallbackFilename;
            }
          })
          .catch(err => {
            console.warn("Filename generation failed in background, using fallback", err);
            setGeneratedFilename(fallbackFilename);
            return fallbackFilename;
          });


        // 最終 prompt 由後端的 api/_shared/imagePrompt.js 組裝，前端只送出創作輸入
        let result = await generateImage({
          userScript,
          stylePrompt,
          styleTags,
          purpose,
          templateContext,
          imageLanguage,
          aspectRatio,
          imageSize,
          imageQuality,
          referenceUploadId,
          signal: abortController.signal,
        });
        const finalPrompt = result?.prompt || "";

        if (result?.jobId) {
          result = await waitForImageJob({
            jobId: result.jobId,
            signal: abortController.signal,
          });
        }

        if (updatePreview) {
          setGeneratedImage(result.imageUrl);
        }
        return {
          imageUrl: result.imageUrl,
          finalPrompt,
          filenamePromise,
          model: result.model || model || DEFAULT_IMAGE_MODEL,
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
    cancelGeneration,
    clearStyle,
    setAnalyzedStyle,
    setAnalysisResultData,
    setGeneratedImage,
  };
}
