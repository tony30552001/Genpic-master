import { useCallback, useRef, useState } from "react";
import { transformImage } from "../services/aiService";
import { requestBlobSas } from "../services/storageService";
import { DEFAULT_IMAGE_MODEL } from "../config";

const INITIAL_MODE = "style_transfer";
const INITIAL_ASPECT_RATIO = "1:1";

const isAbortError = (error) =>
  error?.name === "AbortError" || error?.code === 20;

const uploadBlobWithProgress = ({ blobUrl, sasToken, file, contentType, onProgress }) =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${blobUrl}?${sasToken}`, true);
    xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(blobUrl)
        : reject(new Error(`Upload failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(file);
  });

export default function useImageTransform() {
  // Source image state
  const [sourceFile, setSourceFile] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [sourceBlobSasUrl, setSourceBlobSasUrl] = useState(null);
  const [sourceMimeType, setSourceMimeType] = useState("image/jpeg");
  const [isUploadingSource, setIsUploadingSource] = useState(false);
  const [sourceUploadProgress, setSourceUploadProgress] = useState(0);

  // Transform settings
  const [mode, setMode] = useState(INITIAL_MODE);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(() => {
    try {
      return localStorage.getItem("genpic_image_model") || DEFAULT_IMAGE_MODEL;
    } catch {
      return DEFAULT_IMAGE_MODEL;
    }
  });
  const [aspectRatio, setAspectRatio] = useState(INITIAL_ASPECT_RATIO);

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

      const safeName = `transform-${Date.now()}-${file.name}`.replace(/\s+/g, "-");
      const sasPromise = requestBlobSas({ fileName: safeName, contentType: file.type, container: "uploads" });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("上傳請求逾時，請確認網路連線或重新登入")), 30000)
      );
      const sas = await Promise.race([sasPromise, timeoutPromise]);
      if (!sas?.blobUrl || !sas?.sasToken) throw new Error("無法取得上傳授權，請確認已登入");

      await uploadBlobWithProgress({
        blobUrl: sas.blobUrl,
        sasToken: sas.sasToken,
        file,
        contentType: file.type,
        onProgress: setSourceUploadProgress,
      });
      const blobSasUrl = `${sas.blobUrl}?${sas.sasToken}`;

      const reader = new FileReader();
      reader.onloadend = () => {
        setSourceFile(file);
        setSourcePreview(reader.result);
        setSourceBlobSasUrl(blobSasUrl);
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
    setSourceBlobSasUrl(null);
    setSourceMimeType("image/jpeg");
    setIsUploadingSource(false);
    setSourceUploadProgress(0);
    setResult(null);
    setTransformError("");
  }, []);

  const runTransform = useCallback(async () => {
    if (!sourcePreview) {
      setTransformError("請先上傳來源圖片。");
      return null;
    }

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsTransforming(true);
    setTransformError("");

    try {
      const res = await transformImage({
        imageDataUrl: sourcePreview,
        imageBlobSasUrl: sourceBlobSasUrl,
        mimeType: sourceMimeType,
        mode,
        prompt,
        aspectRatio,
        model,
        signal: abortController.signal,
      });
      setResult(res.imageUrl);
      return res.imageUrl;
    } catch (err) {
      if (isAbortError(err)) {
        const abortError = new Error("已取消本次轉換等待。");
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
  }, [sourcePreview, sourceBlobSasUrl, sourceMimeType, mode, prompt, aspectRatio, model]);

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
    model,
    setModel,
    aspectRatio,
    setAspectRatio,

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
