/**
 * In-image text language directives shared by the prompt optimization roles.
 *
 * The frontend settings panel picks the language of any text rendered inside a
 * generated image, and `useImageGeneration` appends a matching directive to the
 * final generation prompt. The optimizers must know the same language so the
 * English prompt they produce keeps the literal text in its original language
 * instead of translating it, which would contradict that directive.
 */

const IMAGE_TEXT_LANGUAGES = Object.freeze({
  en: { zh: "英文", en: "English" },
  "zh-TW": { zh: "繁體中文", en: "Traditional Chinese" },
  "zh-CN": { zh: "簡體中文", en: "Simplified Chinese" },
  ja: { zh: "日文", en: "Japanese" },
  ko: { zh: "韓文", en: "Korean" },
  es: { zh: "西班牙文", en: "Spanish" },
  fr: { zh: "法文", en: "French" },
  de: { zh: "德文", en: "German" },
});

/** Returns an empty string when the caller did not choose a supported language. */
const buildImageTextDirective = (imageLanguage) => {
  const language = String(imageLanguage || "").trim();
  if (!language) return "";
  if (language === "none") {
    return "圖片中不得出現任何文字。英文 Prompt 必須明確要求畫面沒有文字、標籤或排版元素，也不要用雙引號標示任何文字內容。";
  }

  const label = IMAGE_TEXT_LANGUAGES[language];
  if (!label) return "";
  return `圖片中的文字必須使用${label.zh}（${label.en}）。英文 Prompt 內以雙引號標示的文字必須保留${label.zh}原文、不得翻譯成英文，並說明其位置與排版。`;
};

module.exports = { IMAGE_TEXT_LANGUAGES, buildImageTextDirective };
