import { useCallback, useState } from "react";

import { analyzeStyle, generateImage, generateFilename } from "../services/aiService";

export default function useImageGeneration() {
  const [analyzedStyle, setAnalyzedStyle] = useState("");
  const [analysisResultData, setAnalysisResultData] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [generatedFilename, setGeneratedFilename] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [analysisPhase, setAnalysisPhase] = useState(""); // 新增：分析階段狀態

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
    async ({ userScript, analyzedStyle: stylePrompt, aspectRatio, imageSize, imageLanguage, contentImageUrl, updatePreview = true }) => {
      if (!userScript) {
        throw new Error("請輸入您想要生成的內容或劇情。");
      }

      setIsGenerating(true);
      // 一開始先重置檔名
      setGeneratedFilename("");

      try {
        // 同步發起檔名產生的 Request（不去 await 阻擋主流程，放到背景執行）
        const fallbackFilename = `genpic-${Date.now()}`;
        const filenamePromise = generateFilename({ userScript })
          .then(res => {
            if (res && res.filename) {
              setGeneratedFilename(res.filename);
              return res.filename;
            } else {
              setGeneratedFilename(fallbackFilename);
              return fallbackFilename;
            }
          })
          .catch(err => {
            console.warn("Filename generation failed in background, using fallback", err);
            setGeneratedFilename(fallbackFilename);
            return fallbackFilename;
          });


        // 語系指令
        const LANG_DIRECTIVES = {
          'en': 'All text in the image MUST be in English.',
          'zh-TW': '圖片中的所有文字必須使用繁體中文(Traditional Chinese)。文字必須清晰可讀、字體端正、無錯字。使用標準繁體中文字形（如「體」非「体」、「為」非「为」），避免簡體字或日文漢字。確保文字排版美觀、對齊工整。All text in the image MUST be in Traditional Chinese (zh-TW) with correct traditional stroke forms. Text must be crisp, legible, properly aligned and aesthetically pleasing. Never use simplified Chinese characters.',
          'zh-CN': '图片中的所有文字必须使用简体中文。All text in the image MUST be in Simplified Chinese (zh-CN).',
          'ja': '画像内のすべてのテキストは日本語にしてください。All text in the image MUST be in Japanese.',
          'ko': '이미지의 모든 텍스트는 한국어로 작성하세요. All text in the image MUST be in Korean.',
          'es': 'Todo el texto en la imagen DEBE estar en español.',
          'fr': 'Tout le texte de l\'image DOIT être en français.',
          'de': 'Aller Text im Bild MUSS auf Deutsch sein.',
          'none': 'Do NOT include any text, labels, titles, or words in the image. The image should be purely visual with zero text.',
        };
        const langDirective = imageLanguage ? (LANG_DIRECTIVES[imageLanguage] || '') : '';

        const stylePart = stylePrompt ? `Create an image with the following style: ${stylePrompt}. ` : "";
        const finalPrompt = `${stylePart}The content/subject of the image is: ${userScript}. Ensure the composition is suitable for an infographic or presentation slide.${langDirective ? ` ${langDirective}` : ''}`;

        const result = await generateImage({
          prompt: finalPrompt,
          aspectRatio,
          imageSize,
          imageUrl: contentImageUrl,
        });

        if (updatePreview) {
          setGeneratedImage(result.imageUrl);
        }
        return { imageUrl: result.imageUrl, finalPrompt, filenamePromise };
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
    generatedFilename, // 匯出產生的檔名
    isAnalyzing,
    isGenerating,
    analysisPhase,
    analyzeStyle: runStyleAnalysis,
    generateImage: runGeneration,
    clearStyle,
    setAnalyzedStyle,
    setAnalysisResultData,
    setGeneratedImage,
  };
}
