export const DEFAULT_STYLE_CATEGORY = "general";

export const STYLE_CATEGORIES = [
  {
    key: "social",
    label: "社群貼文",
    description: "Instagram、Facebook、LINE 圖文、短影音封面",
  },
  {
    key: "presentation",
    label: "簡報",
    description: "企業簡報、提案簡報、內訓投影片",
  },
  {
    key: "poster",
    label: "海報",
    description: "活動主視覺、公告、宣傳海報",
  },
  {
    key: "ecommerce",
    label: "電商",
    description: "商品圖、促銷圖、Banner、商品情境圖",
  },
  {
    key: "education",
    label: "教育",
    description: "教材、學習卡、教學視覺、知識圖解",
  },
  {
    key: "document",
    label: "文件視覺化",
    description: "SOP、政策宣導、流程圖解、文件轉分鏡",
  },
  {
    key: "brand",
    label: "品牌識別",
    description: "品牌一致性、企業色、固定視覺語言",
  },
  {
    key: DEFAULT_STYLE_CATEGORY,
    label: "通用",
    description: "無特定用途或跨用途風格",
  },
];

export const STYLE_CATEGORY_OPTIONS = STYLE_CATEGORIES.map(({ key, label }) => ({
  value: key,
  label,
}));

export const STYLE_CATEGORY_LABELS = Object.fromEntries(
  STYLE_CATEGORIES.map((category) => [category.key, category.label])
);

export const STYLE_CATEGORY_KEYS = STYLE_CATEGORIES.map((category) => category.key);

export const getStyleCategoryLabel = (category) =>
  STYLE_CATEGORY_LABELS[category] || STYLE_CATEGORY_LABELS[DEFAULT_STYLE_CATEGORY];

export const isStyleCategory = (category) => STYLE_CATEGORY_KEYS.includes(category);
