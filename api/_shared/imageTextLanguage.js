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

/**
 * The generation directives are defaults, never overrides: text the author
 * spelled out in the description must survive verbatim, and only the wording
 * the author left open follows the chosen language.
 */
const KEEP_QUOTED_TEXT =
  "Render any text the description quotes exactly as written, in its original language.";

const IMAGE_TEXT_LANGUAGES = Object.freeze({
  en: {
    zh: "英文",
    en: "English",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in English.`,
  },
  "zh-TW": {
    zh: "繁體中文",
    en: "Traditional Chinese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in Traditional Chinese (zh-TW) with correct traditional stroke forms, never simplified Chinese characters. All rendered text must be crisp, legible, correctly spelled, and neatly aligned.`,
  },
  "zh-CN": {
    zh: "簡體中文",
    en: "Simplified Chinese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in Simplified Chinese (zh-CN).`,
  },
  ja: {
    zh: "日文",
    en: "Japanese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in Japanese.`,
  },
  ko: {
    zh: "韓文",
    en: "Korean",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in Korean.`,
  },
  es: {
    zh: "西班牙文",
    en: "Spanish",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in Spanish.`,
  },
  fr: {
    zh: "法文",
    en: "French",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in French.`,
  },
  de: {
    zh: "德文",
    en: "German",
    generationDirective: `${KEEP_QUOTED_TEXT} Any other text in the image must be in German.`,
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
