/**
 * Purpose-driven narrative recipes.
 *
 * Style and layout templates decide how a deck looks; a recipe decides what it
 * says and in what order. Without one the outline call is free to invent its
 * own structure, which is why an investor pitch and a training deck came back
 * with the same shape: title, background, three body pages, thank you.
 *
 * A recipe is a spine, not a script. It fixes the sequence of page roles and
 * states what each page has to answer; the model still writes every title,
 * every point and every number. `normalizeOutline` corrects the role sequence
 * afterwards but never overwrites the content, because a recipe knows the
 * shape of the argument and only the model knows the material.
 *
 * `priority` is what makes one recipe serve any page count: 1 is the part of
 * the argument that cannot be dropped, 3 is the first to go when the deck is
 * short. Length is resolved by dropping low-priority sections, never by
 * truncating the spine, so a 6-page pitch still ends on its call to action.
 *
 * This module owns data only. Like `deckFrames.js` it must not require
 * `deckContract.js`, which requires it.
 */

const recipe = (definition) =>
  Object.freeze({
    ...definition,
    sections: Object.freeze(
      definition.sections.map((section) =>
        Object.freeze({ priority: 2, ...section })
      )
    ),
  });

const RECIPE_LIST = [
  recipe({
    id: "pitch-deck",
    label: "投資提案",
    description: "向投資人或決策者募集資源，論證機會、能力與回報",
    tone: "自信、具體、以證據說話；每一頁都要推進「為什麼是現在、為什麼是你們」。",
    defaultSlideCount: 12,
    sections: [
      { role: "cover", ask: "公司或專案名稱，加一句話說清楚你在做什麼", priority: 1 },
      { role: "content", ask: "你要解決的問題有多痛、影響多少人", priority: 1 },
      { role: "content", ask: "你的解決方案，以及它為什麼有效", priority: 1 },
      { role: "content", ask: "市場規模與成長性，盡量用數據", priority: 2 },
      { role: "content", ask: "產品實際是什麼樣子、目前進展到哪", priority: 2 },
      { role: "content", ask: "商業模式：你怎麼賺錢、單位經濟如何", priority: 2 },
      { role: "content", ask: "競爭格局與你的差異化，說明別人為何難以複製", priority: 3 },
      { role: "content", ask: "團隊為什麼是做成這件事的人選", priority: 3 },
      { role: "content", ask: "里程碑與資金用途：要多少、拿來做什麼、達成什麼", priority: 2 },
      { role: "ending", ask: "明確的行動呼籲與聯絡方式", priority: 1 },
    ],
  }),
  recipe({
    id: "business-review",
    label: "營運回顧",
    description: "向管理層回報一段期間的成果、落差與下一步",
    tone: "誠實、對稱；好消息與壞消息用同樣的篇幅與同樣的標準呈現。",
    defaultSlideCount: 12,
    sections: [
      { role: "cover", ask: "回顧的對象與期間", priority: 1 },
      { role: "content", ask: "這段期間的總結：一句話定調", priority: 1 },
      { role: "content", ask: "關鍵指標對照目標，用圖表呈現", priority: 1 },
      { role: "content", ask: "達標與超標的項目，以及成功的原因", priority: 2 },
      { role: "content", ask: "未達標的項目，不要粉飾", priority: 1 },
      { role: "content", ask: "差異分析：為什麼會有落差", priority: 2 },
      { role: "content", ask: "已知風險與阻礙", priority: 3 },
      { role: "content", ask: "下期行動、負責人與時間點", priority: 1 },
      { role: "ending", ask: "對下期的承諾", priority: 1 },
    ],
  }),
  recipe({
    id: "product-launch",
    label: "產品發表",
    description: "對外發表新產品或新版本，建立期待並促成採用",
    tone: "有節奏感、以使用者為主詞；先讓人感受到問題，再讓產品登場。",
    defaultSlideCount: 12,
    sections: [
      { role: "cover", ask: "產品名稱與一句話定位", priority: 1 },
      { role: "content", ask: "使用者今天的痛點與代價", priority: 1 },
      { role: "section", ask: "產品登場的轉場頁", priority: 3 },
      { role: "content", ask: "核心價值主張：它替使用者省下什麼", priority: 1 },
      { role: "content", ask: "第一個關鍵亮點與它的實際效果", priority: 1 },
      { role: "content", ask: "第二個關鍵亮點與它的實際效果", priority: 2 },
      { role: "content", ask: "真實使用情境或客戶案例", priority: 2 },
      { role: "content", ask: "方案、定價與取得方式", priority: 2 },
      { role: "ending", ask: "行動呼籲：現在該做什麼", priority: 1 },
    ],
  }),
  recipe({
    id: "training",
    label: "教育訓練",
    description: "教會受眾一項概念或技能，並讓他們能立刻練習",
    tone: "循序漸進、由淺入深；每個抽象概念後面都要接一個具體例子。",
    defaultSlideCount: 12,
    sections: [
      { role: "cover", ask: "課程主題與對象", priority: 1 },
      { role: "toc", ask: "課程大綱", priority: 2 },
      { role: "content", ask: "學完之後學員能做到什麼", priority: 1 },
      { role: "section", ask: "核心概念的轉場頁", priority: 3 },
      { role: "content", ask: "核心概念說明，用類比或圖解", priority: 1 },
      { role: "content", ask: "實際操作步驟，逐步拆解", priority: 1 },
      { role: "content", ask: "常見錯誤與如何避免", priority: 2 },
      { role: "content", ask: "練習任務：讓學員動手做的題目", priority: 2 },
      { role: "content", ask: "重點回顧", priority: 1 },
      { role: "ending", ask: "延伸資源與後續學習路徑", priority: 1 },
    ],
  }),
  recipe({
    id: "research-report",
    label: "研究分析",
    description: "呈現一份調查或分析的方法、發現與結論",
    tone: "嚴謹、可追溯；每個主張都要指出它建立在什麼資料上。",
    defaultSlideCount: 14,
    sections: [
      { role: "cover", ask: "研究題目與作者", priority: 1 },
      { role: "toc", ask: "報告架構", priority: 3 },
      { role: "content", ask: "背景與問題意識：為什麼值得研究", priority: 1 },
      { role: "content", ask: "研究範圍與方法", priority: 1 },
      { role: "content", ask: "資料來源與樣本說明", priority: 3 },
      { role: "section", ask: "主要發現的轉場頁", priority: 2 },
      { role: "content", ask: "第一項發現，附數據", priority: 1 },
      { role: "content", ask: "第二項發現，附數據", priority: 2 },
      { role: "content", ask: "洞察詮釋：這些發現合起來說明了什麼", priority: 1 },
      { role: "content", ask: "研究限制與未回答的問題", priority: 3 },
      { role: "ending", ask: "結論與建議行動", priority: 1 },
    ],
  }),
  recipe({
    id: "project-proposal",
    label: "專案提案",
    description: "向內部爭取一個專案的立項、資源與授權",
    tone: "務實、可執行；重點在可行性與代價，不在願景。",
    defaultSlideCount: 12,
    sections: [
      { role: "cover", ask: "專案名稱與提案人", priority: 1 },
      { role: "content", ask: "現況與問題：不做會怎樣", priority: 1 },
      { role: "content", ask: "目標與可衡量的成功指標", priority: 1 },
      { role: "content", ask: "建議方案，以及為何不選其他方案", priority: 1 },
      { role: "content", ask: "執行方式：階段、範圍與交付物", priority: 2 },
      { role: "content", ask: "所需資源與預算", priority: 1 },
      { role: "content", ask: "時程與里程碑", priority: 1 },
      { role: "content", ask: "風險與因應措施", priority: 2 },
      { role: "ending", ask: "需要對方做出的決策", priority: 1 },
    ],
  }),
];

const DECK_RECIPES = Object.freeze(
  RECIPE_LIST.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {})
);

/** The absence of a recipe. Behaves exactly as the pipeline did before them. */
const DEFAULT_RECIPE_ID = "general";

const DECK_RECIPE_IDS = Object.freeze([
  DEFAULT_RECIPE_ID,
  ...RECIPE_LIST.map((item) => item.id),
]);

const normalizeRecipeId = (value) => {
  const id = value == null ? "" : String(value).trim();
  return DECK_RECIPES[id] ? id : DEFAULT_RECIPE_ID;
};

const getRecipe = (id) => DECK_RECIPES[normalizeRecipeId(id)] || null;

/** A page the deck needs but the recipe did not name, inserted before the end. */
const SUPPLEMENTARY_SECTION = Object.freeze({
  role: "content",
  ask: "延伸這份簡報的論述：補充證據、細節或另一個面向，不要重複前面的頁面",
  priority: 3,
});

/**
 * A spine of exactly `slideCount` entries, or null when no recipe applies.
 *
 * The opening and the close are structural: a deck that loses its cover or its
 * call to action has stopped being that kind of deck, however short it is. So
 * they are always kept and `priority` ranks the body sections between them —
 * shortening drops the least essential argument, never the frame around it.
 *
 * Lengthening adds supplementary body pages just before the ending, which is
 * the only place extra material can go without breaking the argument.
 */
const buildRecipePlan = (recipeId, slideCount) => {
  const item = getRecipe(recipeId);
  if (!item) return null;

  const count = Number(slideCount);
  if (!Number.isFinite(count) || count < 1) return null;
  const target = Math.floor(count);

  const sections = item.sections;
  const opening = sections[0];
  const closing = sections[sections.length - 1];

  if (target === 1) return [opening];
  if (target === 2) return [opening, closing];

  if (target >= sections.length) {
    const extra = target - sections.length;
    return [
      ...sections.slice(0, sections.length - 1),
      ...Array.from({ length: extra }, () => SUPPLEMENTARY_SECTION),
      closing,
    ];
  }

  const body = sections
    .slice(1, sections.length - 1)
    .map((section, index) => ({ section, index }))
    .sort((a, b) => a.section.priority - b.section.priority || a.index - b.index)
    .slice(0, target - 2)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.section);

  return [opening, ...body, closing];
};

/** The spine as outline instructions. Returns "" when no recipe applies. */
const describeRecipeSpine = (recipeId, slideCount) => {
  const item = getRecipe(recipeId);
  const plan = buildRecipePlan(recipeId, slideCount);
  if (!item || !plan) return "";

  const pages = plan
    .map((section, index) => `${index + 1}. （${section.role}）${section.ask}`)
    .join("\n");

  return `# 敘事骨幹：${item.label}
這份簡報的用途是${item.description}。
語調：${item.tone}

以下是這 ${plan.length} 頁各自要回答的問題。頁數、順序與 page_role 必須完全照這個骨幹，
但每一頁的標題、內容與骨架選擇由你依素材決定；素材不足時就據實少寫，不要用空話填滿。
${pages}`;
};

module.exports = {
  DECK_RECIPES,
  DECK_RECIPE_IDS,
  DEFAULT_RECIPE_ID,
  buildRecipePlan,
  describeRecipeSpine,
  getRecipe,
  normalizeRecipeId,
};
