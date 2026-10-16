/** 決定系統是否為畫面補上構圖與文字語系指令；id 與後端 IMAGE_PURPOSES 一致。 */
export const IMAGE_PURPOSE_OPTIONS = [
  {
    id: "infographic",
    label: "資訊圖表",
    description: "補上簡報版面構圖與文字語系指令",
  },
  {
    id: "storyboard",
    label: "電影分鏡",
    description: "補上電影分鏡構圖與文字語系指令",
  },
  {
    id: "freeform",
    label: "自由創作",
    description: "完全依照你的描述，不附加任何系統指令",
  },
];

export const DEFAULT_IMAGE_PURPOSE = "infographic";
