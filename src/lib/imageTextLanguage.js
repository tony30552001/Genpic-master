import { DEFAULT_IMAGE_LANGUAGE } from "@/config";

/** 圖中文字語系；`none` 代表要求模型不輸出任何文字。 */
export const LANGUAGE_OPTIONS = [
  {
    id: "en",
    label: "English",
    shortLabel: "英文",
    code: "EN",
    description: "Generate images with English text, suitable for international use.",
  },
  {
    id: "zh-TW",
    label: "繁體中文",
    shortLabel: "繁中",
    code: "繁",
    description: "生成包含繁體中文文字的圖片，適合台灣市場。",
  },
  {
    id: "zh-CN",
    label: "简体中文",
    shortLabel: "簡中",
    code: "简",
    description: "生成包含简体中文文字的图片，适合中国大陆市场。",
  },
  {
    id: "ja",
    label: "日本語",
    shortLabel: "日文",
    code: "日",
    description: "日本語のテキストを含む画像を生成します。",
  },
  {
    id: "ko",
    label: "한국어",
    shortLabel: "韓文",
    code: "韓",
    description: "한국어 텍스트가 포함된 이미지를 생성합니다.",
  },
  {
    id: "none",
    label: "No Text",
    shortLabel: "無文字",
    code: "無",
    description: "圖片中不包含任何文字，純圖像模式。",
  },
];

export const NO_TEXT_LANGUAGE = "none";

export function getLanguageOption(id) {
  return LANGUAGE_OPTIONS.find((option) => option.id === id)
    || LANGUAGE_OPTIONS.find((option) => option.id === DEFAULT_IMAGE_LANGUAGE);
}

/** 輸出設定摘要用的文字模式標籤，例如「無文字」「繁中文字」。 */
export function getImageTextModeLabel(id) {
  const option = getLanguageOption(id);
  return option.id === NO_TEXT_LANGUAGE ? option.shortLabel : `${option.shortLabel}文字`;
}
