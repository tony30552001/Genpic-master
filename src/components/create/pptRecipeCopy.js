/**
 * 敘事配方的前端文案與建議值。
 *
 * 後端的 `deckRecipes.js` 只認 id 與骨幹；建議頁數、建議配圖密度與預選風格
 * 只存在於前端，選定後會轉成明確的 slideCount／imageDensity／styleId 送出。
 * 伺服器從不讀取建議值，所以兩邊沒有重複的行為資料，只共用一份 id 清單。
 */
export const DECK_RECIPE_OPTIONS = [
  {
    id: "general",
    name: "不指定",
    description: "由 AI 依素材自行決定章節結構",
    defaultSlideCount: null,
    defaultImageDensity: null,
    preferredStyleId: null,
  },
  {
    id: "pitch-deck",
    name: "投資提案",
    description: "問題、方案、市場、商業模式、團隊、資金用途",
    defaultSlideCount: 12,
    defaultImageDensity: "key",
    preferredStyleId: "investor-pitch",
  },
  {
    id: "business-review",
    name: "營運回顧",
    description: "期間總結、指標對照、達標與落差、下期行動",
    defaultSlideCount: 12,
    defaultImageDensity: "none",
    preferredStyleId: "operating-review",
  },
  {
    id: "product-launch",
    name: "產品發表",
    description: "痛點、產品登場、核心價值、亮點、定價與行動",
    defaultSlideCount: 12,
    defaultImageDensity: "key",
    preferredStyleId: "product-launch",
  },
  {
    id: "training",
    name: "教育訓練",
    description: "大綱、學習目標、概念、操作步驟、練習與回顧",
    defaultSlideCount: 12,
    defaultImageDensity: "key",
    preferredStyleId: "workshop-teaching",
  },
  {
    id: "research-report",
    name: "研究分析",
    description: "問題意識、方法、發現、洞察、限制與結論",
    defaultSlideCount: 14,
    defaultImageDensity: "none",
    preferredStyleId: "academic-research",
  },
  {
    id: "project-proposal",
    name: "專案提案",
    description: "現況、目標、方案、資源、時程、風險與決策",
    defaultSlideCount: 12,
    defaultImageDensity: "none",
    preferredStyleId: "solution-proposal",
  },
];

export const DEFAULT_RECIPE_ID = "general";

export const describeRecipe = (recipeId) =>
  DECK_RECIPE_OPTIONS.find((option) => option.id === recipeId) || DECK_RECIPE_OPTIONS[0];
