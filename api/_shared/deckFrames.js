/**
 * Page frame vocabulary: the geometric half of deck authoring.
 *
 * Without a vocabulary the model invents module bounds on every page, which
 * pushes it toward one generic "title plus bullets" shape and makes the repair
 * loop resolve layout pressure by deleting content. A frame supplies geometry
 * that is already solved, so authoring becomes filling a known skeleton.
 *
 * This is deliberately orthogonal to the upstream template specs injected
 * alongside it: `design_spec.md` owns palette, type scale and narrative tone,
 * a frame owns where things sit. It is also unrelated to `job.layout_id`,
 * which selects a deck-wide upstream template rather than a per-page skeleton.
 *
 * Every bound below is calibrated against the pinned skill's measured text
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
  ["# 版面骨架詞彙（frame）", "為每一頁選一個最貼合內容結構的骨架，不要因為某個骨架存在就使用它。"]
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
            return `- ${item.id}（${item.label}）：${item.intent}。容納 ${points}${image}。`;
          }),
        ];
      })
    )
    .join("\n");

/**
 * The one frame this page committed to. Injected per slide so the authoring
 * call carries exact geometry instead of the whole vocabulary.
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
  framesForPageRole,
  getFrame,
  illustratedVariantOf,
  normalizeFrameId,
};
