import { useCallback, useRef, useState } from "react";
import { transformImage, waitForImageJob } from "../services/aiService";
import { uploadFile } from "../services/storageService";
import { DEFAULT_IMAGE_MODEL } from "../config";
import { STYLE_DIMENSIONS } from "../components/create/styleDimensions";

const INITIAL_MODE = "style_transfer";
const INITIAL_ASPECT_RATIO = "1:1";

const isAbortError = (error) =>
  error?.name === "AbortError" || error?.code === 20;

export default function useImageTransform() {
  // Source image state
  const [sourceFile, setSourceFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [sourceUploadId, setSourceUploadId] = useState(null);
  const [sourceMimeType, setSourceMimeType] = useState("image/jpeg");
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);

  // Transform settings
  const [mode, setMode] = useState(INITIAL_MODE);
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState(INITIAL_ASPECT_RATIO);

  // Style palette (StylePalette tags)
  const [paletteSelected, setPaletteSelected] = useState({});

  // Applied saved style
  const [appliedStylePrompt, setAppliedStylePrompt] = useState("");
  const [appliedStyleName, setAppliedStyleName] = useState("");
  const [appliedStyleId, setAppliedStyleId] = useState(null);

  // Result state
  const [result, setResult] = useState(null);
  const [isTransforming, setIsTransforming] = useState(false);
  const [transformError, setTransformError] = useState("");

  const abortControllerRef = useRef(null);

  const handleSourceImageUpload = useCallback(async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setTransformError("圖片過大，請上傳小於 10MB 的圖片。");
      return;
    }
    setTransformError("");
    try {
      setIsUploadingSource(true);
      setSourceUploadProgress(0);

      const uploadResult = await uploadFile(file, "image");
      if (!uploadResult?.uploadId) throw new Error("無法完成圖片上傳，請確認已登入");
      setSourceUploadProgress(100);

      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceFile(file);
        setSourcePreview(reader.result);
        setSourceUploadId(uploadResult.uploadId);
        setSourceMimeType(file.type || "image/jpeg");
        setTimeout(() => {
          setIsUploadingSource(false);
          setSourceUploadProgress(0);
        }, 1500);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Transform source upload failed:", err);
      setTransformError(err.message || "上傳失敗，請稍後再試。");
      setIsUploadingSource(false);
      setSourceUploadProgress(0);
    }
  }, []);

  const clearSource = useCallback(() => {
    setSourceFile(null);
    setSourcePreview(null);
    setSourceUploadId(null);
    setSourceMimeType("image/jpeg");
    setIsUploadingSource(false);
    setSourceUploadProgress(0);
    setResult(null);
    setTransformError("");
  }, []);

  const runTransform = useCallback(async ({ model = DEFAULT_IMAGE_MODEL, imageSize, imageQuality, imageLanguage } = {}) => {
    if (!sourcePreview || !sourceUploadId) {
      setTransformError("請先上傳來源圖片。");
      return null;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsTransforming(true);
    setTransformError("");

    // Build merged prompt: user prompt + palette style tags + applied saved style
    const paletteStyleStr = STYLE_DIMENSIONS
      .flatMap((d) => paletteSelected[d.id] || [])
      .join("，");

    const parts = [
      prompt.trim(),
      paletteStyleStr ? `風格：${paletteStyleStr}` : "",
      appliedStylePrompt.trim(),
    ].filter(Boolean);
    const mergedPrompt = parts.join("\n");

    try {
      let res = await transformImage({
        uploadId: sourceUploadId,
        mimeType: sourceMimeType,
        mode,
        prompt: mergedPrompt,
        aspectRatio,
        imageSize,
        imageQuality,
        imageLanguage,
        signal: abortController.signal,
      });
      const appliedPrompt = res.prompt || mergedPrompt;
      if (res?.jobId) {
        res = await waitForImageJob({
          jobId: res.jobId,
          signal: abortController.signal,
        });
      }
      setResult(res.imageUrl);
      return {
        imageUrl: res.imageUrl,
        mergedPrompt: appliedPrompt,
        model: res.model || model || DEFAULT_IMAGE_MODEL,
      };
    } catch (err) {
      if (isAbortError(err)) {
        const abortError = new Error(
          "已取消本次轉換等待。若服務端已開始處理，可能仍會消耗請求。"
        );
        abortError.name = "AbortError";
        throw abortError;
      }
      throw err;
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
        setIsTransforming(false);
      }
    }
  }, [sourcePreview, sourceUploadId, sourceMimeType, mode, prompt, aspectRatio, paletteSelected, appliedStylePrompt]);

  const cancelTransform = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return {
    // Source image
    sourceFile,
    sourcePreview,
    isUploadingSource,
    sourceUploadProgress,
    handleSourceImageUpload,
    clearSource,

    // Settings
    mode,
    setMode,
    prompt,
    setPrompt,
    aspectRatio,
    setAspectRatio,

    // Style palette
    paletteSelected,
    setPaletteSelected,

    // Applied saved style
    appliedStylePrompt,
    setAppliedStylePrompt,
    appliedStyleName,
    setAppliedStyleName,
    appliedStyleId,
    setAppliedStyleId,

    // Result
    result,
    isTransforming,
    transformError,
    setTransformError,
    runTransform,
    cancelTransform,
    clearResult,
  };
}
