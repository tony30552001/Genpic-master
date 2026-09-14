export const getImageModelSetupError = (modelConfig) => {
  if (
    typeof modelConfig?.modelKey !== "string" ||
    !modelConfig.modelKey.trim() ||
    typeof modelConfig.label !== "string" ||
    !modelConfig.label.trim() ||
    modelConfig.apiType !== "azure-openai-images-v1" ||
    !Array.isArray(modelConfig.supportedQualities) ||
    !modelConfig.supportedQualities.length ||
    !modelConfig.supportedQualities.every((quality) => typeof quality === "string" && quality.trim()) ||
    !modelConfig.supportedQualities.includes(modelConfig.defaultQuality)
  ) {
    return "圖片模型尚未完成設定，請聯絡管理員設定模型目錄與預設模型。";
  }
  return "";
};

export const getImageQualityError = (modelConfig, quality) =>
  getImageModelSetupError(modelConfig) ||
  (modelConfig.supportedQualities.includes(quality)
    ? ""
    : "目前模型不支援已選品質，請重新選擇圖片品質。");
