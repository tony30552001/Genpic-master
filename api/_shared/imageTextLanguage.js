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
  "Do not include any text, labels, titles, letters, numbers, logos, or watermarks. The image must be purely visual.";

const NO_TEXT_OPTIMIZER_DIRECTIVE =
  "使用者選擇純視覺輸出；不得創造或保留任何圖片文字內容，也不要在 optimized prompts 中加入逐字文字或文字版面需求。";

/**
 * The generation directives are defaults, never overrides: text the author
 * spelled out in the description must survive verbatim, and only the wording
 * the author left open follows the chosen language.
 */
const KEEP_QUOTED_TEXT =
  "Render every quoted string exactly as written, in its original language, and exactly the number of times requested. If no count is specified, render it once. Do not add decorative, filler, or unrequested text.";

const IMAGE_TEXT_LANGUAGES = Object.freeze({
  en: {
    zh: "英文",
    en: "English",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in English.`,
  },
  "zh-TW": {
    zh: "繁體中文",
    en: "Traditional Chinese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in Traditional Chinese (zh-TW), using correct traditional stroke forms and never simplified Chinese characters. All rendered text must be crisp, legible, correctly spelled, and neatly aligned.`,
  },
  "zh-CN": {
    zh: "簡體中文",
    en: "Simplified Chinese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in Simplified Chinese (zh-CN).`,
  },
  ja: {
    zh: "日文",
    en: "Japanese",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in Japanese.`,
  },
  ko: {
    zh: "韓文",
    en: "Korean",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in Korean.`,
  },
  es: {
    zh: "西班牙文",
    en: "Spanish",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in Spanish.`,
  },
  fr: {
    zh: "法文",
    en: "French",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in French.`,
  },
  de: {
    zh: "德文",
    en: "German",
    generationDirective: `${KEEP_QUOTED_TEXT} Any necessary text explicitly requested without exact wording must be in German.`,
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
  return `只呈現使用者明確要求的圖片文字，不得增加裝飾性或填充文字。以雙引號標示的文字必須逐字保留原文，依使用者要求的次數呈現；未指定次數時只出現一次，並說明位置與排版。使用者要求但未指定逐字內容的必要文字必須使用${entry.zh}（${entry.en}）。`;
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
