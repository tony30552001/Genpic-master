import { useCallback, useState } from "react";

import { uploadFile } from "../services/storageService";
import { imageUrlToFile, nearestAspectRatio, readImageSize } from "../lib/imageFile";

/**
 * "修改這張": refines the selected version with a short instruction and adds the
 * result as its child. Each version is uploaded at most once; its uploadId and
 * aspect ratio are cached on the version for later refinements and branches.
 *
 * Failures stay inline (`refineError`) so the current image and instruction remain.
 */
export default function useImageRefine({ versions, transformImage, saveHistoryItem }) {
  const [isRefining, setIsRefining] = useState(false);
  const [refineError, setRefineError] = useState("");
  const { activeVersion, addVersion, setVersionUpload } = versions;

  const uploadVersion = async (version) => {
    if (version.upload) return version.upload;
    const file = await imageUrlToFile(version.imageUrl, `pixora-${version.id}`);
    const uploadResult = await uploadFile(file, "image");
    if (!uploadResult?.uploadId) throw new Error("無法完成圖片上傳，請確認已登入");
    const { width, height } = await readImageSize(version.imageUrl);
    const upload = { uploadId: uploadResult.uploadId, aspectRatio: nearestAspectRatio(width, height) };
    setVersionUpload(version.id, upload);
    return upload;
  };

  /**
   * `getSettings` is resolved inside the request so a model-setup error is shown
   * next to the instruction like any other refinement failure.
   */
  const refine = async (instruction, getSettings) => {
    const trimmed = instruction.trim();
    const source = activeVersion;
    if (!trimmed || !source || isRefining) return false;

    setIsRefining(true);
    setRefineError("");
    try {
      const { imageQuality, imageLanguage } = getSettings();
      const { uploadId, aspectRatio } = await uploadVersion(source);
      const result = await transformImage({
        uploadId,
        mode: "refine",
        prompt: trimmed,
        aspectRatio,
        imageQuality,
        imageLanguage,
        filenameSource: trimmed,
      });
      addVersion({
        jobId: result.jobId,
        imageUrl: result.imageUrl,
        instruction: trimmed,
        parentId: source.id,
      });
      try {
        await saveHistoryItem({
          jobId: result.jobId,
          imageUrl: result.imageUrl,
          userScript: trimmed,
          stylePrompt: "",
          fullPrompt: result.finalPrompt,
          styleId: null,
          source: "refine",
        });
      } catch (err) {
        setRefineError(`已完成修改，但無法存入紀錄：${err.message || "請稍後再試"}`);
      }
      return true;
    } catch (err) {
      setRefineError(err.message || "修改失敗，請稍後再試。");
      return false;
    } finally {
      setIsRefining(false);
    }
  };

  const clearRefineError = useCallback(() => setRefineError(""), []);

  return { refine, isRefining, refineError, clearRefineError };
}
