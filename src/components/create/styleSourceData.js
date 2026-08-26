import { STYLE_DIMENSIONS } from "./styleDimensions";

export const STYLE_SOURCE_CONTEXT_VERSION = 1;
export const DEFAULT_TASK_TEMPLATE_ID = "infographic";
export const DEFAULT_STYLE_PRESET_ID = "editorial";

export const TASK_TEMPLATES = Object.freeze([
  {
    id: "infographic",
    title: "資訊圖引擎",
    description: "把主題拆成可掃讀的資訊模組。",
    badge: "適合報告",
    purpose: "infographic",
    defaultModules: 4,
    moduleOptions: [3, 4, 5, 6],
    defaultFlow: "橫向流程",
    flowOptions: ["橫向流程", "縱向時間線", "放射中心", "矩陣對比"],
    guidance: [
      "以清楚的視覺層級呈現每個模組，讓讀者快速理解重點。",
      "讓標題、關鍵數字與輔助說明有明確的閱讀順序。",
    ],
    pitfalls: [
      "避免長段正文塞入畫面。",
      "模組數不可超過設定值。",
    ],
  },
  {
    id: "poster",
    title: "敘事海報",
    description: "用單一主視覺傳達一個明確訊息。",
    badge: "適合宣傳",
    purpose: "freeform",
    defaultModules: 3,
    moduleOptions: [1, 2, 3, 4],
    defaultFlow: "主視覺聚焦",
    flowOptions: ["主視覺聚焦", "上標下圖", "中心構圖", "留白平衡"],
    guidance: [
      "保持單一視覺焦點，讓標題與主訊息有足夠留白。",
      "用大小、位置與對比建立一眼可讀的訊息層級。",
    ],
    pitfalls: [
      "避免把多個平等訊息堆成資訊牆。",
      "避免裝飾元素搶過主訊息。",
    ],
  },
  {
    id: "product",
    title: "商品展示",
    description: "突出產品、材質與使用情境。",
    badge: "適合產品",
    purpose: "freeform",
    defaultModules: 3,
    moduleOptions: [2, 3, 4, 5],
    defaultFlow: "主體＋細節",
    flowOptions: ["主體＋細節", "情境展示", "正面主視覺", "材質拆解"],
    guidance: [
      "優先呈現產品輪廓、材質與使用情境，背景保持克制。",
      "讓產品主體與細節說明形成清晰的視覺關係。",
    ],
    pitfalls: [
      "避免裝飾元素搶過產品主體。",
      "避免讓背景細節模糊產品輪廓。",
    ],
  },
  {
    id: "storyboard",
    title: "電影分鏡",
    description: "以鏡頭與場景節奏組織敘事。",
    badge: "適合劇情",
    purpose: "storyboard",
    defaultModules: 4,
    moduleOptions: [3, 4, 5, 6],
    defaultFlow: "鏡頭序列",
    flowOptions: ["鏡頭序列", "三幕節奏", "平行剪接", "情緒遞進"],
    guidance: [
      "以鏡位、景別與動作交代場景節奏，保持敘事連續。",
      "讓每個畫面都能獨立表達一個可辨識的故事節點。",
    ],
    pitfalls: [
      "避免把分鏡做成沒有動作關係的靜態拼貼。",
      "避免同一場景的鏡位與角色位置突然跳動。",
    ],
  },
]);

export const STYLE_PRESETS = Object.freeze([
  {
    id: "dawn",
    title: "晨光編輯感",
    description: "溫暖、乾淨",
    previewUrl: "/style-presets/dawn-editorial.svg",
    prompt:
      "a warm editorial visual language with natural morning light, clean neutral surfaces, restrained composition, and gentle documentary realism",
    palette: {
      paintStyle: "寫實",
      lighting: "柔和光",
      color: "乾淨",
      mood: "溫暖",
      composition: "極簡",
    },
  },
  {
    id: "editorial",
    title: "冷靜編輯藍",
    description: "專業、清晰",
    previewUrl: "/style-presets/cool-editorial-blue.svg",
    prompt:
      "a calm editorial visual language with cool blue accents, crisp flat illustration, restrained low-saturation color, and generous negative space",
    palette: {
      paintStyle: "插畫",
      lighting: "柔和光",
      color: "低彩度",
      mood: "安靜",
      composition: "平面",
    },
  },
  {
    id: "paper",
    title: "紙張手作感",
    description: "柔和、有溫度",
    previewUrl: "/style-presets/paper-handmade.svg",
    prompt:
      "a tactile handmade paper visual language with soft picture-book forms, pastel colors, warm studio light, and visible paper texture",
    palette: {
      paintStyle: "繪本",
      lighting: "燈拍",
      color: "粉彩",
      mood: "溫暖",
      material: "紙質感",
    },
  },
  {
    id: "night",
    title: "夜色電影感",
    description: "強烈、有張力",
    previewUrl: "/style-presets/night-cinematic.svg",
    prompt:
      "a cinematic night visual language with dramatic high-contrast lighting, monochrome neon tones, wide-angle energy, and atmospheric depth",
    palette: {
      paintStyle: "電影感",
      lighting: "高對比",
      color: "單色",
      mood: "活力",
      composition: "廣角",
    },
  },
]);

export const CORE_STYLE_DIMENSIONS = STYLE_DIMENSIONS.filter((dimension) =>
  ["paintStyle", "lighting", "color"].includes(dimension.id)
);

export const MORE_STYLE_DIMENSIONS = STYLE_DIMENSIONS.filter(
  (dimension) => !CORE_STYLE_DIMENSIONS.some((core) => core.id === dimension.id)
);

export const getTaskTemplate = (id) =>
  TASK_TEMPLATES.find((template) => template.id === id) || null;

export const getStylePreset = (id) =>
  STYLE_PRESETS.find((preset) => preset.id === id) || null;

export const paletteToSelection = (palette = {}) =>
  Object.fromEntries(
    Object.entries(palette)
      .filter(([, value]) => value)
      .map(([dimensionId, value]) => [dimensionId, [value]])
  );

export const tagsToSelection = (tags = []) => {
  const values = new Set(Array.isArray(tags) ? tags : []);
  return Object.fromEntries(
    STYLE_DIMENSIONS
      .map((dimension) => {
        const value = dimension.tags.find((tag) => values.has(tag));
        return value ? [dimension.id, [value]] : null;
      })
      .filter(Boolean)
  );
};

export const selectionToTags = (selection = {}) =>
  STYLE_DIMENSIONS.flatMap((dimension) => selection[dimension.id] || [])
    .map((tag) => String(tag).trim())
    .filter(Boolean);

export const buildTaskTemplateContext = (
  templateOrId = DEFAULT_TASK_TEMPLATE_ID,
  overrides = {}
) => {
  const template =
    typeof templateOrId === "string"
      ? getTaskTemplate(templateOrId)
      : templateOrId;

  if (!template) return null;

  return {
    version: STYLE_SOURCE_CONTEXT_VERSION,
    id: template.id,
    outputType: template.id,
    title: template.title,
    purpose: template.purpose,
    moduleCount: overrides.moduleCount ?? template.defaultModules,
    informationFlow: overrides.informationFlow ?? template.defaultFlow,
    guidance: [...template.guidance],
    pitfalls: [...template.pitfalls],
  };
};
