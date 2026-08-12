import { useCallback, useEffect, useRef, useState } from "react";

import {
  MAX_DOCUMENT_FILE_SIZE,
  isSupportedDocumentFile,
} from "../lib/documentFormats";
import {
  createDeckJob,
  downloadDeckJobPptx,
  listPptTemplates,
  waitForDeckJob,
} from "../services/aiService";
import { uploadFileToBlob } from "../services/storageService";

const INITIAL_PROGRESS = { phase: "", current: 0, total: 0 };

/**
 * PPT Master 簡報生成 Hook：建立非同步 job、輪詢進度、下載 PPTX。
 */
export default function usePptMasterDeck() {
  const [templates, setTemplates] = useState({ styles: [], layouts: [] });
  const [templatesError, setTemplatesError] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(INITIAL_PROGRESS);
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    listPptTemplates({ signal: controller.signal })
      .then((catalog) => {
        if (cancelled) return;
        setTemplates({
          styles: catalog?.styles || [],
          layouts: catalog?.layouts || [],
        });
        setTemplatesError(null);
      })
      .catch((loadError) => {
        if (cancelled || loadError?.name === "AbortError") return;
        setTemplatesError(loadError.message || "無法載入簡報模板");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const generate = useCallback(async ({ topic, file, slideCount, styleId, layoutId }) => {
    const trimmedTopic = String(topic || "").trim();
    if (!file && trimmedTopic.length < 4) {
      throw new Error("請輸入至少 4 個字的簡報主題，或上傳一份文件。");
    }
    if (file) {
      if (!isSupportedDocumentFile(file)) {
        throw new Error(
          "不支援的檔案格式。請上傳 PDF、Office、OpenDocument、RTF、EPUB、CSV、文字或圖片檔案。"
        );
      }
      if (file.size > MAX_DOCUMENT_FILE_SIZE) {
        throw new Error("檔案大小超過 50MB 限制。");
      }
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setError(null);
    setDeck(null);
    setProgress({ phase: "準備中", current: 0, total: slideCount || 0 });

    try {
      let documentUrl = null;
      if (file) {
        setProgress({ phase: "上傳文件到雲端儲存空間", current: 0, total: slideCount || 0 });
        const uploadResult = await uploadFileToBlob(file, "uploads");
        documentUrl = uploadResult.url;
      }

      const job = await createDeckJob({
        topic: trimmedTopic || null,
        documentUrl,
        fileName: file?.name || null,
        slideCount,
        styleId: styleId || null,
        layoutId: layoutId || null,
        signal: controller.signal,
      });

      const finished = await waitForDeckJob({
        jobId: job.jobId,
        signal: controller.signal,
        onProgress: (update) =>
          setProgress({
            phase: update?.phase || "產生簡報中",
            current: update?.progress?.current || 0,
            total: update?.progress?.total || slideCount || 0,
          }),
      });

      const result = {
        jobId: finished.jobId,
        title: finished.deckTitle,
        fileName: finished.fileName,
        slideCount: finished.slideCount,
      };
      setDeck(result);
      setProgress({
        phase: "已完成",
        current: finished.progress?.total || 0,
        total: finished.progress?.total || 0,
      });
      return result;
    } catch (generationError) {
      if (generationError?.name === "AbortError") {
        setProgress(INITIAL_PROGRESS);
        throw generationError;
      }
      const message = generationError.message || "簡報生成失敗，請稍後重試。";
      setError(message);
      setProgress(INITIAL_PROGRESS);
      throw generationError;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGenerating(false);
    setProgress(INITIAL_PROGRESS);
  }, []);

  const download = useCallback(async () => {
    if (!deck?.jobId) return;
    const blob = await downloadDeckJobPptx({ jobId: deck.jobId });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = deck.fileName || "presentation.pptx";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [deck]);

  const reset = useCallback(() => {
    setDeck(null);
    setError(null);
    setProgress(INITIAL_PROGRESS);
  }, []);

  return {
    templates,
    templatesError,
    isGenerating,
    progress,
    deck,
    error,
    generate,
    cancel,
    download,
    reset,
  };
}
