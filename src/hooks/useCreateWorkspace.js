import { useCallback, useState } from "react";

import { uploadFile } from "../services/storageService";
import {
  REFERENCE_PURPOSE,
  getAttachmentPurpose,
} from "../lib/attachmentPurposes";
import {
  imageUrlToFile,
  nearestAspectRatio,
  readFileAsDataUrl,
  readImageSize,
} from "../lib/imageFile";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * The creation workspace: an optional attached image, what it is used for,
 * and one submit that routes to generate-images or image-transform and records
 * the result in the history.
 *
 * The job lifecycle (progress, cancel, preview) belongs to useImageGeneration;
 * this hook decides which job to start and with which inputs.
 */
export default function useCreateWorkspace({ generateImage, transformImage, saveHistoryItem }) {
  const [attachment, setAttachment] = useState(null);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [purposeId, setPurposeId] = useState(REFERENCE_PURPOSE);

  const purpose = getAttachmentPurpose(attachment ? purposeId : REFERENCE_PURPOSE);
  const isTransform = purpose.id !== REFERENCE_PURPOSE;

  const attachFileWithOrigin = useCallback(async (file, origin) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error("圖片過大，請上傳小於 10MB 的圖片。");
    }
    setIsUploadingAttachment(true);
    try {
      const uploadResult = await uploadFile(file, "image");
      if (!uploadResult?.uploadId) throw new Error("無法完成圖片上傳，請確認已登入");
      const previewUrl = await readFileAsDataUrl(file);
      const { width, height } = await readImageSize(previewUrl);
      setAttachment({
        uploadId: uploadResult.uploadId,
        previewUrl,
        name: file.name,
        origin,
        aspectRatio: nearestAspectRatio(width, height),
      });
    } finally {
      setIsUploadingAttachment(false);
    }
  }, []);

  const attachFile = useCallback(
    (file) => attachFileWithOrigin(file, "upload"),
    [attachFileWithOrigin]
  );

  const attachImageUrl = useCallback(async (url) => {
    if (!url) return;
    setIsUploadingAttachment(true);
    try {
      const file = await imageUrlToFile(url, `pixora-result-${Date.now()}`);
      await attachFileWithOrigin(file, "result");
    } finally {
      setIsUploadingAttachment(false);
    }
  }, [attachFileWithOrigin]);

  const clearAttachment = useCallback(() => {
    setAttachment(null);
    setPurposeId(REFERENCE_PURPOSE);
  }, []);

  const canSubmit = (userScript) =>
    !isUploadingAttachment && (!purpose.requiresPrompt || Boolean(userScript?.trim()));

  /**
   * `prompt` is what the image model receives (an accepted optimizer rewrite or
   * the typed text); `userScript` is the typed text kept in the history.
   */
  const submit = async ({
    prompt,
    userScript,
    stylePrompt = "",
    styleTags = [],
    styleId = null,
    imagePurpose,
    aspectRatio,
    imageQuality,
    imageLanguage,
  }) => {
    const appliedStylePrompt = purpose.usesStyle ? stylePrompt : "";
    const appliedStyleTags = purpose.usesStyle ? styleTags : [];
    const historyStylePrompt = [appliedStylePrompt, appliedStyleTags.join("，")].filter(Boolean).join("，");

    const result = isTransform
      ? await transformImage({
        uploadId: attachment.uploadId,
        mode: purpose.id,
        prompt: prompt.trim(),
        stylePrompt: appliedStylePrompt,
        styleTags: appliedStyleTags,
        aspectRatio: attachment.aspectRatio,
        imageQuality,
        imageLanguage,
        filenameSource: userScript || purpose.label,
      })
      : await generateImage({
        userScript: prompt,
        analyzedStyle: appliedStylePrompt,
        styleTags: appliedStyleTags,
        purpose: imagePurpose,
        aspectRatio,
        imageQuality,
        imageLanguage,
        referenceUploadId: attachment?.uploadId || null,
      });

    await saveHistoryItem({
      jobId: result.jobId,
      imageUrl: result.imageUrl,
      userScript: userScript || purpose.label,
      stylePrompt: historyStylePrompt,
      fullPrompt: result.finalPrompt,
      styleId: purpose.usesStyle ? styleId : null,
      source: isTransform ? purpose.id : "general",
    });

    return { ...result, styleId: purpose.usesStyle ? styleId : null };
  };

  return {
    attachment,
    isUploadingAttachment,
    purpose,
    isTransform,
    aspectRatioLocked: Boolean(attachment) && purpose.keepsSourceAspectRatio,
    setPurpose: setPurposeId,
    attachFile,
    attachImageUrl,
    clearAttachment,
    canSubmit,
    submit,
  };
}
