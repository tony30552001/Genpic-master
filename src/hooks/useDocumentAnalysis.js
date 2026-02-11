import { useCallback, useState } from "react";

import { analyzeDocument } from "../services/aiService";
import { uploadFileToBlob } from "../services/storageService";

/**
 * 文件分析 Hook
 * 處理文件上傳、分析和分鏡腳本提取
 */
export default function useDocumentAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState("");
  const [documentResult, setDocumentResult] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [error, setError] = useState(null);

  // 4MB 以下直接用 base64；以上走 Blob Storage 上傳
  const BASE64_THRESHOLD = 4 * 1024 * 1024;

  /**
   * 分析文件並提取分鏡腳本
   * @param {File} file - 上傳的文件物件
   */
  const analyzeDocumentFromFile = useCallback(async (file) => {
    if (!file) {
      throw new Error("請先選擇文件。");
    }

    // 驗證檔案格式
    const supportedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
      "text/plain",
      "image/png",
      "image/jpeg",
    ];

    const fileExtension = file.name.split(".").pop().toLowerCase();
    const supportedExtensions = ["pdf", "docx", "pptx", "txt", "md", "png", "jpg", "jpeg"];

    if (!supportedTypes.includes(file.type) && !supportedExtensions.includes(fileExtension)) {
      throw new Error("不支援的檔案格式。請上傳 PDF、DOCX、PPTX、TXT 或圖片檔案。");
    }

    // 檔案大小限制 (50MB)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      throw new Error("檔案大小超過 50MB 限制。");
    }

    setIsAnalyzing(true);
    setError(null);
    setCurrentFile(file);

    try {
      const analysisParams = {
        fileName: file.name,
        contentType: file.type,
      };

      if (file.size < BASE64_THRESHOLD) {
        // 小檔案：直接轉 base64 傳送
        setAnalysisPhase("準備文件內容...");
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        analysisParams.base64Content = base64;
      } else {
        // 大檔案：上傳到 Blob Storage，後端用 SDK 直讀
        setAnalysisPhase("上傳文件到雲端儲存空間...");
        try {
          const uploadResult = await uploadFileToBlob(file);
          analysisParams.documentUrl = uploadResult.url;
        } catch (uploadErr) {
          // Blob 上傳失敗時回退到 base64
          console.warn("Blob upload failed, falling back to base64:", uploadErr);
          setAnalysisPhase("準備文件內容...");
          const arrayBuffer = await file.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          analysisParams.base64Content = base64;
        }
      }

      // 呼叫 AI 分析
      setAnalysisPhase("AI 正在分析文件內容（約需 15-30 秒）...");

      const result = await analyzeDocument(analysisParams);

      // 步驟 3: 處理結果
      setAnalysisPhase("整理分析結果...");

      if (!result.scenes || result.scenes.length === 0) {
        throw new Error("無法從文件中提取場景，請嘗試其他文件。");
      }

      const analysisResult = {
        ...result,
        fileName: file.name,
        fileSize: file.size,
        analyzedAt: new Date().toISOString(),
      };

      setDocumentResult(analysisResult);
      setAnalysisPhase("");
      return analysisResult;
    } catch (err) {
      const errorMessage = err.message || "文件分析失敗，請稍後重試。";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  /**
   * 清除分析結果
   */
  const clearDocument = useCallback(() => {
    setDocumentResult(null);
    setCurrentFile(null);
    setError(null);
    setAnalysisPhase("");
  }, []);

  /**
   * 更新特定場景的內容
   */
  const updateScene = useCallback((sceneIndex, updates) => {
    setDocumentResult((prev) => {
      if (!prev || !prev.scenes) return prev;

      const newScenes = [...prev.scenes];
      if (newScenes[sceneIndex]) {
        newScenes[sceneIndex] = { ...newScenes[sceneIndex], ...updates };
      }

      return { ...prev, scenes: newScenes };
    });
  }, []);

  /**
   * 刪除特定場景
   */
  const removeScene = useCallback((sceneIndex) => {
    setDocumentResult((prev) => {
      if (!prev || !prev.scenes) return prev;

      const newScenes = prev.scenes.filter((_, index) => index !== sceneIndex);
      // 重新編號
      const renumberedScenes = newScenes.map((scene, idx) => ({
        ...scene,
        scene_number: idx + 1,
      }));

      return {
        ...prev,
        scenes: renumberedScenes,
        total_scenes: renumberedScenes.length,
      };
    });
  }, []);

  return {
    // 狀態
    isAnalyzing,
    analysisPhase,
    documentResult,
    currentFile,
    error,

    // 動作
    analyzeDocument: analyzeDocumentFromFile,
    clearDocument,
    updateScene,
    removeScene,

    // 計算屬性
    hasDocument: !!documentResult,
    totalScenes: documentResult?.scenes?.length || 0,
    scenes: documentResult?.scenes || [],
    characters: documentResult?.characters || [],
    title: documentResult?.title || "",
    summary: documentResult?.summary || "",
  };
}
