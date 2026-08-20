/**
 * ppt-master 模板的繁體中文說明。
 *
 * 上游 `styles_index.json` / `layouts_index.json` 只有英文摘要與關鍵字，
 * 直接顯示使用者看不懂要選什麼，因此在這裡集中維護中文文案。
 * 找不到對照時退回上游摘要，讓新增的模板仍然可用。
 */

const STYLE_COPY = {
  "academic-research": {
    name: "學術研究報告",
    description:
      "從研究問題、方法到結果建立可被檢驗的論證，並誠實呈現研究限制。",
    tags: ["學術", "論文口試", "研究方法"],
  },
  "consulting-decision": {
    name: "顧問決策建議",
    description:
      "結論先行、證據導向的決策文件，版面克制、以分析與圖表說話。",
    tags: ["管理顧問", "決策支援", "結論先行"],
  },
  "creative-pitch": {
    name: "創意提案",
    description:
      "用一個真實洞察撐起單一創意概念，並展示它在各種接觸點的樣貌。",
    tags: ["廣告", "品牌", "行銷企劃"],
  },
  "incident-postmortem": {
    name: "事故檢討報告",
    description:
      "不究責的事故回顧：重建時間軸、區分肇因與責任，收斂到可驗證的行動項。",
    tags: ["事故檢討", "系統可靠性", "根因分析"],
  },
  "investor-pitch": {
    name: "投資募資簡報",
    description:
      "從「為什麼是現在」講到「為什麼是這個團隊」，用數據取代形容詞。",
    tags: ["募資", "新創", "投資人"],
  },
  "narrative-keynote": {
    name: "敘事型主題演講",
    description:
      "以張力、轉折與具體人物細節鋪陳，讓單一主張真正被聽眾記住。",
    tags: ["主題演講", "說故事", "說服"],
  },
  "operating-review": {
    name: "營運檢討會議",
    description:
      "把結果、差異、原因與負責人的承諾分開陳述，不美化不好看的數字。",
    tags: ["營運檢討", "關鍵指標", "當責"],
  },
  "product-launch": {
    name: "產品發表",
    description:
      "價值先行：每個能力主張都先用可展示的畫面證明，再為它命名。",
    tags: ["產品上市", "市場定位", "功能展示"],
  },
  "science-explainer": {
    name: "科普說明",
    description:
      "從熟悉的事物出發，用視覺類比建立理解，但不為了淺顯犧牲正確性。",
    tags: ["科普", "科學傳播", "對外說明"],
  },
  "solution-proposal": {
    name: "解決方案提案",
    description:
      "先證明你真的理解客戶的處境，再用具體、含成本的計畫贏得專案。",
    tags: ["提案", "售前", "客戶簡報"],
  },
  "technical-deepdive": {
    name: "技術深入解析",
    description:
      "機制先行：每個論點都回到限制條件、取捨與可觀察到的實際行為。",
    tags: ["技術", "系統架構", "工程取捨"],
  },
  "workshop-teaching": {
    name: "工作坊教學",
    description:
      "做中學：依序安排學習目標、示範、練習與誠實的理解檢核。",
    tags: ["教育訓練", "工作坊", "新人上手"],
  },
};

const LAYOUT_COPY = {
  presentation_core: {
    name: "通用簡報",
    description:
      "最泛用的骨架，涵蓋一般敘述、編輯式分欄、圖像、流程與數據頁型。不確定選什麼就用這個。",
    tags: ["泛用", "圖表", "流程"],
  },
  editorial_bleed: {
    name: "滿版大圖",
    description:
      "大圖鋪滿整頁不留白邊，標題直接壓在圖片上，視覺張力強，適合形象、品牌與開場頁。",
    tags: ["滿版圖片", "形象簡報", "視覺張力"],
  },
  report_core: {
    name: "正式報告",
    description:
      "帶固定頁首頁尾與頁碼的報告骨架，含議程、章節分隔、KPI 與附錄頁型，適合長篇正式文件。",
    tags: ["正式報告", "頁碼", "議程"],
  },
};

const fallbackCopy = (option) => ({
  name: option.id,
  description: option.summary || "",
  tags: (option.keywords || []).slice(0, 3),
});

const describe = (map) => (option) => {
  const copy = map[option.id];
  if (!copy) return fallbackCopy(option);
  return {
    name: copy.name,
    description: copy.description,
    tags: copy.tags,
  };
};

export const describeStyle = describe(STYLE_COPY);

export const describeLayout = (option) => {
  const copy = describe(LAYOUT_COPY)(option);
  if (!option.pageCount) return copy;
  return { ...copy, meta: `${option.pageCount} 種頁面版型` };
};

/**
 * 配圖密度的選項文案。密度決定的是張數，實際挑哪幾頁由後端政策裁定，
 * 因此描述只承諾範圍與代價，不承諾特定頁碼。
 */
export const IMAGE_DENSITY_OPTIONS = [
  {
    id: "none",
    name: "不配圖",
    description: "全部以純版面呈現，生成最快。",
  },
  {
    id: "key",
    name: "重點配圖",
    description: "封面與章節等關鍵頁配圖，約佔三分之一頁數。",
  },
  {
    id: "every",
    name: "每頁配圖",
    description: "每一頁都配圖，視覺最完整，生成時間與費用也最高。",
  },
];

export const describeImageDensity = (id) =>
  IMAGE_DENSITY_OPTIONS.find((option) => option.id === id) ||
  IMAGE_DENSITY_OPTIONS[1];
