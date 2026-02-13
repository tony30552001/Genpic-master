import { useCallback, useState } from "react";

import { analyzeStyle, generateImage } from "../services/aiService";

export default function useImageGeneration() {
  const [analyzedStyle, setAnalyzedStyle] = useState("");
  const [analysisResultData, setAnalysisResultData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(""); // 新增：分析階段描述

  const runStyleAnalysis = useCallback(async ({ referencePreview, imageUrl }) => {
    if (!referencePreview && !imageUrl) {
      throw new Error("請先上傳參考圖片。");
    }

    setIsAnalyzing(true);
    setAnalysisPhase("上傳圖片並準備分析...");

    try {
      setAnalysisPhase("AI 正在解析風格特徵（約需 5-10 秒）...");
      const result = await analyzeStyle({
        referencePreview,
        imageUrl,
      });

      setAnalysisPhase("儲存分析結果...");
      setAnalyzedStyle(result.style_prompt || "");
      setAnalysisResultData(result);
      setAnalysisPhase("");
      return result;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const runGeneration = useCallback(
    async ({ userScript, analyzedStyle: stylePrompt, aspectRatio, imageSize, imageLanguage, contentImageUrl }) => {
      if (!userScript) {
        throw new Error("請輸入您想要生成的內容或劇情。");
      }

      setIsGenerating(true);
      try {
        // 語系指令
        const LANG_DIRECTIVES = {
          'en': 'All text in the image MUST be in English.',
          'zh-TW': '圖片中的所有文字必須使用繁體中文。All text in the image MUST be in Traditional Chinese (zh-TW).',
          'zh-CN': '图片中的所有文字必须使用简体中文。All text in the image MUST be in Simplified Chinese (zh-CN).',
          'ja': '画像内のすべてのテキストは日本語にしてください。All text in the image MUST be in Japanese.',
          'ko': '이미지의 모든 텍스트는 한국어로 작성하세요. All text in the image MUST be in Korean.',
          'es': 'Todo el texto en la imagen DEBE estar en español.',
          'fr': 'Tout le texte de l\'image DOIT être en français.',
          'de': 'Aller Text im Bild MUSS auf Deutsch sein.',
          'none': 'Do NOT include any text, labels, titles, or words in the image. The image should be purely visual with zero text.',
        };
        const langDirective = imageLanguage ? (LANG_DIRECTIVES[imageLanguage] || '') : '';

        const finalPrompt = `Create an image with the following style: ${stylePrompt || "High quality, professional corporate style"
          }. The content/subject of the image is: ${userScript}. Ensure the composition is suitable for an infographic or presentation slide.${langDirective ? ` ${langDirective}` : ''
          }`;

        const result = await generateImage({
          prompt: finalPrompt,
          aspectRatio,
          imageSize,
          imageUrl: contentImageUrl,
        });

        setGeneratedImage(result.imageUrl);
        return { imageUrl: result.imageUrl, finalPrompt };
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
    analysisPhase, // 回傳分析階段狀態
    analyzeStyle: runStyleAnalysis,
    generateImage: runGeneration,
    clearStyle,
    setAnalyzedStyle,
    setAnalysisResultData,
    setGeneratedImage,
  };
}
