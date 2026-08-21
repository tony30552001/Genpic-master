/**
 * The in-image text language chosen in the settings panel.
 *
 * One table drives two audiences:
 * - `buildImageTextDirective` instructs the prompt optimizers (an LLM) to keep
 *   literal in-image text in the chosen language instead of translating it.
 * - `buildGenerationTextDirective` instructs the image model itself about the
 *   language it must render.
 *
 * Both must stay derived from this table so the optimized prompt and the
 * generation request can never disagree about the language.
 */

const NO_TEXT = "none";

const NO_TEXT_GENERATION_DIRECTIVE =
  "Do NOT include any text, labels, titles, or words in the image. The image should be purely visual with zero text.";

const NO_TEXT_OPTIMIZER_DIRECTIVE =
  "圖片中不得出現任何文字。英文 Prompt 必須明確要求畫面沒有文字、標籤或排版元素，也不要用雙引號標示任何文字內容。";

const IMAGE_TEXT_LANGUAGES = Object.freeze({
  en: {
    zh: "英文",
    en: "English",
    generationDirective: "All text in the image MUST be in English.",
  },
  "zh-TW": {
    zh: "繁體中文",
    en: "Traditional Chinese",
    generationDirective:
      "圖片中的所有文字必須使用繁體中文(Traditional Chinese)。文字必須清晰可讀、字體端正、無錯字。使用標準繁體中文字形（如「體」非「体」、「為」非「为」），避免簡體字或日文漢字。確保文字排版美觀、對齊工整。All text in the image MUST be in Traditional Chinese (zh-TW) with correct traditional stroke forms. Text must be crisp, legible, properly aligned and aesthetically pleasing. Never use simplified Chinese characters.",
  },
  "zh-CN": {
    zh: "簡體中文",
    en: "Simplified Chinese",
    generationDirective:
      "图片中的所有文字必须使用简体中文。All text in the image MUST be in Simplified Chinese (zh-CN).",
  },
  ja: {
    zh: "日文",
    en: "Japanese",
    generationDirective:
      "画像内のすべてのテキストは日本語にしてください。All text in the image MUST be in Japanese.",
  },
  ko: {
    zh: "韓文",
    en: "Korean",
    generationDirective:
      "이미지의 모든 텍스트는 한국어로 작성하세요. All text in the image MUST be in Korean.",
  },
  es: {
    zh: "西班牙文",
    en: "Spanish",
    generationDirective: "Todo el texto en la imagen DEBE estar en español.",
  },
  fr: {
    zh: "法文",
    en: "French",
    generationDirective: "Tout le texte de l'image DOIT être en français.",
  },
  de: {
    zh: "德文",
    en: "German",
    generationDirective: "Aller Text im Bild MUSS auf Deutsch sein.",
  },
});

const resolveLanguage = (imageLanguage) => String(imageLanguage || "").trim();

/** Optimizer-facing directive. Empty when no supported language was chosen. */
const buildImageTextDirective = (imageLanguage) => {
  const language = resolveLanguage(imageLanguage);
  if (!language) return "";
  if (language === NO_TEXT) return NO_TEXT_OPTIMIZER_DIRECTIVE;

  const entry = IMAGE_TEXT_LANGUAGES[language];
  if (!entry) return "";
  return `圖片中的文字必須使用${entry.zh}（${entry.en}）。英文 Prompt 內以雙引號標示的文字必須保留${entry.zh}原文、不得翻譯成英文，並說明其位置與排版。`;
};

/** Image-model-facing directive. Empty when no supported language was chosen. */
const buildGenerationTextDirective = (imageLanguage) => {
  const language = resolveLanguage(imageLanguage);
  if (!language) return "";
  if (language === NO_TEXT) return NO_TEXT_GENERATION_DIRECTIVE;

  return IMAGE_TEXT_LANGUAGES[language]?.generationDirective || "";
};

module.exports = {
  IMAGE_TEXT_LANGUAGES,
  buildGenerationTextDirective,
  buildImageTextDirective,
};
