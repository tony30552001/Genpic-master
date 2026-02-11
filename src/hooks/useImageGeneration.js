import { useCallback, useState } from "react";

import { analyzeStyle, generateImage } from "../services/aiService";

export default function useImageGeneration() {
  const [analyzedStyle, setAnalyzedStyle] = useState("");
  const [analysisResultData, setAnalysisResultData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const runStyleAnalysis = useCallback(async ({ referencePreview, imageUrl }) => {
    if (!referencePreview && !imageUrl) {
      throw new Error("請先上傳參考圖片。");
    }

    setIsAnalyzing(true);
    try {
      const result = await analyzeStyle({
        referencePreview,
        imageUrl,
      });

      setAnalyzedStyle(result.style_prompt || "");
      setAnalysisResultData(result);
      return result;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const runGeneration = useCallback(
    async ({ userScript, analyzedStyle: stylePrompt, aspectRatio, imageSize }) => {
      if (!userScript) {
        throw new Error("請輸入您想要生成的內容或劇情。");
      }

      setIsGenerating(true);
      try {
        const finalPrompt = `Create an image with the following style: ${
          stylePrompt || "High quality, professional corporate style"
        }. The content/subject of the image is: ${userScript}. Ensure the composition is suitable for an infographic or presentation slide.`;

        const imageUrl = await generateImage({
          prompt: finalPrompt,
          aspectRatio,
          imageSize,
        });

        setGeneratedImage(imageUrl);
        return { imageUrl, finalPrompt };
      } finally {
        setIsGenerating(false);
      }
    },
    []
  );

  const clearStyle = useCallback(() => {
    setAnalyzedStyle("");
    setAnalysisResultData(null);
  }, []);

  return {
    analyzedStyle,
    analysisResultData,
    generatedImage,
    isAnalyzing,
    isGenerating,
    analyzeStyle: runStyleAnalysis,
    generateImage: runGeneration,
    clearStyle,
    setAnalyzedStyle,
    setAnalysisResultData,
    setGeneratedImage,
  };
}
