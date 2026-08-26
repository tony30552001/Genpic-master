/**
 * Page frame vocabulary: the structural half of deck authoring.
 *
 * A frame declares what kind of page this is — how many points it holds, what
 * relationship the content has, whether it carries a picture or a chart. Its
 * `modules` also carry solved geometry, but that geometry now serves two very
 * different consumers:
 *
 * - `describeFrameIntent` (the main path) publishes the *meaning* only. The
 *   author places modules itself, aligned to the deck design system's grid.
 * - `describeFrameGeometry` (the retreat path) publishes the exact bounds, and
 *   is reached only after a page has failed the preflight repair loop.
 *
 * The inversion is deliberate. Fixed bounds made every deck the same fifteen
 * shapes in different colours; a modern authoring model produces better pages
 * when it owns the geometry. Keeping the numbers costs nothing and buys a
 * safety net that is already calibrated, so they stay.
 *
 * This is orthogonal to the upstream template specs injected alongside it:
 * `design_spec.md` owns narrative tone, `deckDesign.js` owns palette, type
 * scale and grid, a frame owns page structure. It is also unrelated to
 * `job.layout_id`, which selects a deck-wide upstream template.
 *
 * The retreat geometry is calibrated against the pinned skill's measured text
 * metrics: CJK advances 1.00 x font-size per character, Latin and halfwidth
 * about 0.54, a text box reaches 0.85 x font-size above its baseline and 0.35
 * below, and a module may be up to 5% narrower than its content before the
 * gate rejects it. Re-measure and re-calibrate whenever the skill pin changes.
 *
 * This module owns data only. It must not require deckContract.js: the
 * contract requires this file to normalize outline slides, and the canvas
 * containment invariants are asserted in the tests instead.
 */

/** Content modules stay inside this margin; `bleed` modules are exempt. */
const FRAME_SAFE_AREA = Object.freeze({
  left: 96,
  top: 80,
  right: 1184,
  bottom: 640,
});

const frame = (definition) => Object.freeze({
  imageRole: null,
  fallbackWithoutImage: null,
  imageModule: null,
  native: null,
  chartType: null,
  drawing: null,
  ...definition,
  modules: Object.freeze(definition.modules.map((module) => Object.freeze({ optional: false, bleed: false, ...module }))),
});

const FRAME_LIST = [
  frame({
    id: "cover-centered",
    label: "置中封面",
    intent: "沒有配圖時的標準封面，標題置中、層級明確",
    pageRoles: ["cover"],
    pointsRange: [0, 0],
    modules: [
      { id: "title", label: "簡報主標題", bounds: [96, 240, 1088, 140] },
      { id: "subtitle", label: "副標題或一句話定位", bounds: [96, 400, 1088, 70] },
      { id: "meta", label: "日期、講者或單位", bounds: [96, 520, 1088, 60], optional: true },
    ],
  }),
  frame({
    id: "cover-bleed",
    label: "滿版封面",
    intent: "以整頁底圖建立第一印象，標題壓在圖上",
    pageRoles: ["cover"],
    pointsRange: [0, 0],
    imageRole: "background",
    fallbackWithoutImage: "cover-centered",
    imageModule: "backdrop",
    modules: [
      { id: "backdrop", label: "滿版底圖，鋪滿整個畫布", bounds: [0, 0, 1280, 720], bleed: true },
      { id: "title", label: "簡報主標題，壓在底圖上", bounds: [96, 380, 900, 130] },
      { id: "subtitle", label: "副標題", bounds: [96, 540, 900, 60] },
    ],
  }),
  frame({
    id: "toc-two-column",
    label: "雙欄目錄",
    intent: "章節目錄或議程，項目分兩欄排列",
    pageRoles: ["toc"],
    pointsRange: [3, 8],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "left", label: "前半段項目", bounds: [96, 220, 512, 420] },
      { id: "right", label: "後半段項目", bounds: [672, 220, 512, 420] },
    ],
  }),
  frame({
    id: "toc-image-side",
    label: "圖側目錄",
    intent: "目錄需要一張意象定調時，項目在左、圖片在右",
    pageRoles: ["toc"],
    pointsRange: [3, 6],
    imageRole: "hero",
    fallbackWithoutImage: "toc-two-column",
    imageModule: "visual",
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "list", label: "章節項目", bounds: [96, 200, 600, 440] },
      { id: "visual", label: "主視覺圖片", bounds: [736, 220, 448, 299] },
    ],
  }),
  frame({
    id: "section-number",
    label: "序號章節頁",
    intent: "以大序號標示進度的章節轉場",
    pageRoles: ["section"],
    pointsRange: [0, 1],
    modules: [
      { id: "index", label: "章節序號，字級遠大於標題", bounds: [96, 220, 200, 160] },
      { id: "title", label: "章節名稱", bounds: [96, 410, 1000, 110] },
    ],
  }),
  frame({
    id: "section-bleed",
    label: "滿版章節頁",
    intent: "以整頁意象作為刻意的視覺停頓",
    pageRoles: ["section"],
    pointsRange: [0, 1],
    imageRole: "background",
    fallbackWithoutImage: "section-number",
    imageModule: "backdrop",
    modules: [
      { id: "backdrop", label: "滿版底圖，鋪滿整個畫布", bounds: [0, 0, 1280, 720], bleed: true },
      { id: "title", label: "章節名稱，壓在底圖上", bounds: [96, 420, 900, 120] },
    ],
  }),
  frame({
    id: "content-bullets",
    label: "標題條列",
    intent: "最泛用的論述頁；當內容沒有明確的結構關係時使用",
    pageRoles: ["content"],
    pointsRange: [2, 5],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "points", label: "條列重點，含序號或項目符號等幾何元素", bounds: [96, 220, 1088, 420] },
    ],
  }),
  frame({
    id: "compare-2col",
    label: "並排比較",
    intent: "兩個對立或平行的選項、方案、前後對照",
    pageRoles: ["content"],
    pointsRange: [2, 6],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "left-head", label: "左側項目名稱", bounds: [96, 200, 512, 70] },
      { id: "left-body", label: "左側論述", bounds: [96, 290, 512, 350] },
      { id: "right-head", label: "右側項目名稱", bounds: [672, 200, 512, 70] },
      { id: "right-body", label: "右側論述", bounds: [672, 290, 512, 350] },
    ],
  }),
  frame({
    id: "kpi-three",
    label: "三欄數據",
    intent: "三個並列的關鍵指標、數字或支柱",
    pageRoles: ["content"],
    pointsRange: [3, 3],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "kpi-1", label: "第一個指標：數字在上、說明在下", bounds: [96, 240, 336, 240] },
      { id: "kpi-2", label: "第二個指標", bounds: [472, 240, 336, 240] },
      { id: "kpi-3", label: "第三個指標", bounds: [848, 240, 336, 240] },
      { id: "note", label: "資料來源或補充說明", bounds: [96, 520, 1088, 90], optional: true },
    ],
  }),
  frame({
    id: "timeline-horizontal",
    label: "水平時間軸",
    intent: "有先後順序的階段、里程碑或歷程",
    pageRoles: ["content"],
    pointsRange: [3, 4],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "axis", label: "水平軸線，細長矩形", bounds: [96, 300, 1088, 8] },
      { id: "step-1", label: "第一個階段：節點、時間、說明", bounds: [96, 340, 248, 280] },
      { id: "step-2", label: "第二個階段", bounds: [376, 340, 248, 280] },
      { id: "step-3", label: "第三個階段", bounds: [656, 340, 248, 280] },
      { id: "step-4", label: "第四個階段", bounds: [936, 340, 248, 280], optional: true },
    ],
  }),
  frame({
    id: "process-vertical",
    label: "垂直流程",
    intent: "逐步推進的流程、方法或因果鏈，每步各佔一條橫帶",
    pageRoles: ["content"],
    pointsRange: [3, 3],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "step-1", label: "第一步：序號在左、說明在右", bounds: [96, 210, 1088, 130] },
      { id: "step-2", label: "第二步", bounds: [96, 360, 1088, 130] },
      { id: "step-3", label: "第三步", bounds: [96, 510, 1088, 130] },
    ],
  }),
  frame({
    id: "matrix-2x2",
    label: "四格矩陣",
    intent: "兩個維度交叉出的四個象限，或四個並列面向",
    pageRoles: ["content"],
    pointsRange: [4, 4],
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "quadrant-1", label: "左上象限", bounds: [96, 210, 512, 210] },
      { id: "quadrant-2", label: "右上象限", bounds: [672, 210, 512, 210] },
      { id: "quadrant-3", label: "左下象限", bounds: [96, 430, 512, 210] },
      { id: "quadrant-4", label: "右下象限", bounds: [672, 430, 512, 210] },
    ],
  }),
  frame({
    id: "quote-hero",
    label: "大字引言",
    intent: "單一強力主張、引述或洞察，刻意留白",
    pageRoles: ["content"],
    pointsRange: [1, 1],
    modules: [
      { id: "quote", label: "引言本文，字級遠大於一般內文", bounds: [96, 220, 1088, 280] },
      { id: "attribution", label: "出處、人物或補充", bounds: [96, 540, 1088, 70] },
    ],
  }),
  frame({
    id: "text-image-split",
    label: "圖文分工",
    intent: "論述需要一張意象支撐，文字在左、圖片在右",
    pageRoles: ["content"],
    pointsRange: [2, 4],
    imageRole: "hero",
    fallbackWithoutImage: "content-bullets",
    imageModule: "visual",
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "body", label: "論述與重點", bounds: [96, 200, 512, 400] },
      { id: "visual", label: "主視覺圖片", bounds: [672, 220, 512, 342] },
    ],
  }),
  frame({
    id: "chart-bars",
    label: "長條圖",
    intent: "比較數個項目的量值或排名，例如各季營收、各通路佔比",
    pageRoles: ["content"],
    pointsRange: [1, 3],
    native: "chart",
    chartType: "column",
    drawing: [
      "資料區請畫出真正的長條圖：先取數列最大值當作滿刻度，每根長條的長度＝數值 ÷ 最大值 × 資料區高度，由共同基線往上長。",
      "每根長條寬度一致、間距一致；長條顏色依序取自設計系統的 chartPalette。",
      "每根長條上方標數值、下方標分類名稱，字級用 typeScale.caption。",
      "畫一條基線，並視需要加 2 到 3 條淡色水平參考線；不要畫刻度標籤以外的座標軸文字。",
    ].join(""),
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "chart", label: "長條圖資料區", bounds: [96, 210, 700, 400] },
      { id: "readout", label: "這張圖說明了什麼", bounds: [840, 240, 344, 340] },
    ],
  }),
  frame({
    id: "chart-donut",
    label: "環圈圖",
    intent: "呈現組成比例或單一佔比，例如市佔、預算分配",
    pageRoles: ["content"],
    pointsRange: [1, 3],
    native: "chart",
    chartType: "doughnut",
    drawing: [
      "資料區請畫出真正的環圈圖：各段角度＝數值 ÷ 總和 × 360 度，從十二點鐘方向順時針排列。",
      '每一段用 <path> 的弧線指令繪製（M 起點 A rx ry 0 largeArc sweep 終點 …），外圈半徑與內圈半徑相差約外圈的三分之一，形成環狀；largeArc 在該段超過 180 度時為 1。',
      "各段顏色依序取自設計系統的 chartPalette；環圈中央放最重要的那個數字，字級用 typeScale.display 或 title。",
      "旁邊列出圖例：小色塊加分類名稱與百分比，字級用 typeScale.caption。",
    ].join(""),
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "chart", label: "環圈圖資料區", bounds: [96, 200, 560, 420] },
      { id: "readout", label: "這個比例代表什麼", bounds: [716, 240, 468, 340] },
    ],
  }),
  frame({
    id: "data-table",
    label: "資料表",
    intent: "多個項目在多個欄位上的對照，例如方案比較、預算明細",
    pageRoles: ["content"],
    pointsRange: [0, 2],
    native: "table",
    drawing: [
      "資料區請畫出真正的表格：表頭列用設計系統的 accent 或 surface 當底色、文字加粗；",
      "每一列高度一致，欄寬依內容分配但左右緣必須落在網格欄線上；",
      "以細線分隔列，或改用隔列淡色底色，兩者擇一不要並用；數值欄請靠右對齊、文字欄靠左對齊。",
    ].join(""),
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "table", label: "表格資料區", bounds: [96, 200, 1088, 380] },
      { id: "note", label: "表格附註或結論", bounds: [96, 596, 1088, 44], optional: true },
    ],
  }),
  frame({
    id: "kpi-four",
    label: "四欄數據",
    intent: "四個並列的關鍵指標或數字",
    pageRoles: ["content"],
    pointsRange: [4, 4],
    drawing: [
      "四欄等寬並列，每一欄的數字用 typeScale.display、標籤用 typeScale.caption，數字與標籤的基線在四欄之間必須對齊。",
      "這一頁是純 SVG，不要加原生物件標記。",
    ].join(""),
    modules: [
      { id: "title", label: "頁面標題", bounds: [96, 80, 1088, 90] },
      { id: "kpi-1", label: "第一個指標：數字加標籤", bounds: [96, 250, 248, 240] },
      { id: "kpi-2", label: "第二個指標：數字加標籤", bounds: [376, 250, 248, 240] },
      { id: "kpi-3", label: "第三個指標：數字加標籤", bounds: [656, 250, 248, 240] },
      { id: "kpi-4", label: "第四個指標：數字加標籤", bounds: [936, 250, 248, 240] },
    ],
  }),
  frame({
    id: "ending-statement",
    label: "結語",
    intent: "收束全份簡報的最後一頁",
    pageRoles: ["ending"],
    pointsRange: [0, 2],
    modules: [
      { id: "message", label: "結語主句", bounds: [96, 260, 1088, 160] },
      { id: "detail", label: "行動呼籲或聯絡資訊", bounds: [96, 450, 1088, 100], optional: true },
    ],
  }),
  frame({
    id: "ending-bleed",
    label: "滿版結語",
    intent: "以整頁意象收尾，結語壓在圖上",
    pageRoles: ["ending"],
    pointsRange: [0, 2],
    imageRole: "background",
    fallbackWithoutImage: "ending-statement",
    imageModule: "backdrop",
    modules: [
      { id: "backdrop", label: "滿版底圖，鋪滿整個畫布", bounds: [0, 0, 1280, 720], bleed: true },
      { id: "message", label: "結語主句，壓在底圖上", bounds: [96, 300, 900, 150] },
      { id: "detail", label: "行動呼籲或聯絡資訊", bounds: [96, 480, 900, 90], optional: true },
    ],
  }),
];

const DECK_FRAMES = Object.freeze(
  FRAME_LIST.reduce((map, item) => {
    map[item.id] = item;
    return map;
  }, {})
);

const DECK_FRAME_IDS = Object.freeze(FRAME_LIST.map((item) => item.id));

/** Fallback per page role, used when the model omits or invents a frame. */
const DEFAULT_FRAME_BY_PAGE_ROLE = Object.freeze({
  cover: "cover-centered",
  toc: "toc-two-column",
  section: "section-number",
  content: "content-bullets",
  ending: "ending-statement",
});

const getFrame = (id) => DECK_FRAMES[id] || null;

/**
 * Inverse of `fallbackWithoutImage`, built from the same declarations so the
 * two directions can never drift apart.
 */
const ILLUSTRATED_VARIANT = Object.freeze(
  FRAME_LIST.reduce((map, item) => {
    if (item.fallbackWithoutImage) map[item.fallbackWithoutImage] = item.id;
    return map;
  }, {})
);

/**
 * The illustrated sibling of a text-only frame, or null when this frame has
 * none. Frames whose structure carries the meaning — a matrix, a timeline —
 * deliberately have no illustrated form: adding a picture would cost the
 * structure, so such a page simply stays unillustrated.
 */
const illustratedVariantOf = (id) => ILLUSTRATED_VARIANT[id] || null;

const framesForPageRole = (pageRole) =>
  FRAME_LIST.filter((item) => item.pageRoles.includes(pageRole));

/**
 * Resolve an outline's frame choice.
 *
 * A frame that does not serve this page role is treated as absent: honouring
 * it would hand the author geometry designed for a different kind of page.
 */
const normalizeFrameId = (value, pageRole) => {
  const id = value == null ? "" : String(value).trim();
  const candidate = DECK_FRAMES[id];
  if (candidate && candidate.pageRoles.includes(pageRole)) return id;
  return DEFAULT_FRAME_BY_PAGE_ROLE[pageRole] || "content-bullets";
};

const formatBounds = (bounds) => bounds.join(" ");

/**
 * The complete vocabulary, as a map the outline reads before it commits to a
 * page. Geometry is deliberately excluded here: the strategist chooses by
 * meaning, and only the chosen frame's numbers reach the authoring call.
 */
const describeFrameCatalog = () =>
  [
    "# 版面骨架詞彙（frame）",
    "為每一頁選一個最貼合內容結構的骨架，不要因為某個骨架存在就使用它。",
    "只要來源內容有具體數字，就優先選擇資料骨架，並把數據填進該頁的 chart 或 table 欄位，不要把數據寫成條列文字。",
  ]
    .concat(
      ["cover", "toc", "section", "content", "ending"].flatMap((pageRole) => {
        const items = framesForPageRole(pageRole);
        if (items.length === 0) return [];
        return [
          `\n## ${pageRole}`,
          ...items.map((item) => {
            const [min, max] = item.pointsRange;
            const points = min === max ? `${min} 條重點` : `${min} 到 ${max} 條重點`;
            const image = item.imageRole ? `，需要 ${item.imageRole} 配圖` : "";
            const data =
              item.native === "chart"
                ? `，必須填寫 chart 欄位（type: "${item.chartType}"）`
                : item.native === "table"
                  ? "，必須填寫 table 欄位"
                  : "";
            return `- ${item.id}（${item.label}）：${item.intent}。容納 ${points}${image}${data}。`;
          }),
        ];
      })
    )
    .join("\n");

/**
 * What this page is, without saying where anything sits.
 *
 * This is the main authoring path. The author receives structural intent, the
 * drawing method for data pages, and the image contract — then resolves
 * geometry itself against the design system's grid, which is what keeps pages
 * consistent with one another now that they no longer share bounds.
 */
const describeFrameIntent = (id) => {
  const item = getFrame(id);
  if (!item) return "";

  const [min, max] = item.pointsRange;
  const lines = [
    `# 本頁結構：${item.label}（${item.id}）`,
    `適用情境：${item.intent}`,
  ];

  if (max > 0) {
    lines.push(
      min === max
        ? `建議承載 ${min} 條重點。`
        : `建議承載 ${min} 到 ${max} 條重點；實際容量由你依網格與字級判斷，寧可留白也不要塞滿。`
    );
  }

  lines.push(
    "版面由你決定：請依設計系統的網格安排各個根層群組的位置與大小，每個群組都要有 data-pptx-bounds，且左右緣落在欄線上、頁標題基線與全份一致。"
  );

  if (item.drawing) lines.push(item.drawing);

  if (item.imageModule) {
    const module = item.modules.find((entry) => entry.id === item.imageModule);
    lines.push(
      item.imageRole === "background"
        ? '本頁有一張約 3:2 的橫幅圖片，請用 <image> 鋪滿整個 1280x720 畫布，該群組加上 data-pptx-bleed="true"，並在圖與文字之間鋪一層半透明色塊確保可讀性。'
        : `本頁有一張約 3:2 的橫幅圖片（${module ? module.label : "主視覺"}），請安排它的位置與大小；<image> 需加上 preserveAspectRatio="xMidYMid slice"，超出的部分會被裁掉。`
    );
  } else {
    lines.push("本頁沒有圖片，請勿使用 <image>。");
  }

  lines.push(
    '整頁背景色使用根層的 <rect data-pptx-role="background">，它不是群組、不需要 bounds。'
  );

  return lines.join("\n");
};

/**
 * The retreat path: exact geometry for a page whose free-form attempt failed
 * the preflight repair loop. Reaching this function means we gave up on the
 * model's own layout for one page, so it hands over numbers that are already
 * known to compile rather than asking for another attempt.
 */
const describeFrameGeometry = (id) => {
  const item = getFrame(id);
  if (!item) return "";

  const lines = item.modules.map((module) => {
    const suffix = module.optional ? "（可省略）" : "";
    const note = module.bleed ? "，此模組是滿版元素，不受安全邊界限制" : "";
    const picture = module.id === item.imageModule ? "，這一格放本頁圖片" : "";
    return `- <g id="${module.id}" data-pptx-bounds="${formatBounds(module.bounds)}">：${module.label}${note}${picture}${suffix}`;
  });

  const imageNote = item.imageModule
    ? [
        `圖片放進 ${item.imageModule} 這一格，<image> 的 x／y／width／height 就用該格的 bounds，`,
        '並加上 preserveAspectRatio="xMidYMid slice"。圖片本身是約 3:2 的橫幅，超出的部分會被裁掉。',
        item.imageRole === "background"
          ? "文字壓在圖上，請加一層半透明色塊確保可讀性。"
          : "",
      ]
        .filter(Boolean)
        .join("")
    : "本頁沒有圖片模組，請勿使用 <image>。";

  return [
    `# 本頁版面骨架：${item.label}（${item.id}）`,
    `適用情境：${item.intent}`,
    "請完全依照下列根層群組配置，id 與 data-pptx-bounds 必須逐字使用：",
    ...lines,
    "標記為可省略的模組若無內容可以整個略去；除此之外不要新增或刪除根層群組，也不要更動任何 bounds 數值。",
    "整頁背景色仍使用根層的 <rect data-pptx-role=\"background\">，它不是群組、不需要 bounds。",
    imageNote,
  ].join("\n");
};

module.exports = {
  DECK_FRAMES,
  DECK_FRAME_IDS,
  DEFAULT_FRAME_BY_PAGE_ROLE,
  FRAME_SAFE_AREA,
  describeFrameCatalog,
  describeFrameGeometry,
  describeFrameIntent,
  framesForPageRole,
  getFrame,
  illustratedVariantOf,
  normalizeFrameId,
};
