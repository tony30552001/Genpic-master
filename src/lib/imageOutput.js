const GPT_IMAGE_SIZE_LABELS = {
  "16:9": "1536×1024",
  "4:3": "1360×1024",
  "1:1": "1024×1024",
  "9:16": "1024×1536",
};

export const getImageOutputLabel = ({
  imageModel,
  aspectRatio,
  imageSize,
}) => {
  if (imageModel === "gpt-image-2") {
    return GPT_IMAGE_SIZE_LABELS[aspectRatio] || "1024×1024";
  }

  return imageSize || "";
};
