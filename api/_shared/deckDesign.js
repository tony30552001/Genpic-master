const { DECK_CANVAS_HEIGHT, DECK_CANVAS_WIDTH } = require("./deckContract");
const { FRAME_SAFE_AREA } = require("./deckFrames");

/**
 * The visual constitution of one deck.
 *
 * Pages are authored one LLM call at a time, so page 7 never sees page 6. When
 * frames owned the geometry that did not matter: identical bounds made pages
 * agree by construction. Now that pages compose their own layout, this module
 * is the only thing they share, and it has to carry enough to keep a deck
 * looking like one deck — palette and type are not enough, so it also owns a
 * grid.
 *
 * Everything here is normalized before it reaches a prompt. A design system the
 * model invented badly (unreadable contrast, inverted type scale, a grid that
 * spills off the canvas) would corrupt every page at once, which is precisely
 * the failure the per-page repair loop cannot fix.
 */

const MIN_CONTENT_WIDTH = 400;
const MIN_CONTENT_HEIGHT = 240;
/** WCAG AA for large text. Deck body copy is large by web standards. */
const MIN_CONTRAST_RATIO = 4.5;

const TYPE_SCALE_BOUNDS = Object.freeze({
  display: [60, 110],
  title: [32, 56],
  subtitle: [20, 30],
  body: [16, 24],
  caption: [12, 16],
});

/** Descending order is a contract: describeDesignSystem states it as a rule. */
const TYPE_SCALE_ORDER = Object.freeze([
  "display",
  "title",
  "subtitle",
  "body",
  "caption",
]);

const PALETTE_KEYS = Object.freeze([
  "background",
  "surface",
  "ink",
  "muted",
  "accent",
  "accentSoft",
]);

/** Series colours, kept separate so the fallback padding can reuse them. */
const DEFAULT_CHART_PALETTE = Object.freeze(["#2F6FEB", "#F2994A", "#27AE60"]);

const DEFAULT_DESIGN_SYSTEM = Object.freeze({
  name: "Editorial Neutral",
  palette: Object.freeze({
    background: "#FFFFFF",
    surface: "#F4F5F7",
    ink: "#1A1D21",
    muted: "#5B6169",
    accent: "#2F6FEB",
    accentSoft: "#DCE7FD",
  }),
  chartPalette: DEFAULT_CHART_PALETTE,
  typeScale: Object.freeze({
    display: 84,
    title: 44,
    subtitle: 24,
    body: 19,
    caption: 14,
  }),
  grid: Object.freeze({
    margin: Object.freeze({ top: 88, right: 104, bottom: 88, left: 104 }),
    columns: 12,
    gutter: 24,
    titleBaseline: 148,
    rhythm: "區塊之間至少空 32，同一區塊內的行距不超過字級的 1.6 倍。",
  }),
  decoration: "以細橫線分隔標題與內文，重點以左側短色條標示，不使用陰影與圓角。",
  rules: Object.freeze([
    "每頁只用一個強調色，其餘以墨色與灰階承擔。",
    "標題一律齊左，與內文共用同一條左基準線。",
    "留白是版面的一部分，不要把內容填滿安全區。",
  ]),
  artDirection:
    "Muted editorial illustration, restrained two-tone palette, soft geometric shapes, flat perspective",
});

const HEX_INPUT = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Accept loose hex input but emit only the strict form the SVG grammar allows.
 * Being tolerant here avoids discarding an otherwise good palette over "#fff".
 */
const normalizeHex = (value) => {
  const match = HEX_INPUT.exec(String(value == null ? "" : value).trim());
  if (!match) return null;
  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split("")
          .map((digit) => digit + digit)
          .join("")
      : digits;
  return `#${full.toUpperCase()}`;
};

const channelLuminance = (channel) => {
  const ratio = channel / 255;
  return ratio <= 0.03928 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
};

const relativeLuminance = (hex) => {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * channelLuminance(red) +
    0.7152 * channelLuminance(green) +
    0.0722 * channelLuminance(blue)
  );
};

const contrastRatio = (foreground, background) => {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
};

/**
 * A palette is all-or-nothing. Mixing a model's accent with our fallback ink
 * produces a combination neither side designed, so one bad value discards the
 * set.
 */
const normalizePalette = (raw) => {
  if (!raw || typeof raw !== "object") return DEFAULT_DESIGN_SYSTEM.palette;

  const palette = {};
  for (const key of PALETTE_KEYS) {
    const hex = normalizeHex(raw[key]);
    if (!hex) return DEFAULT_DESIGN_SYSTEM.palette;
    palette[key] = hex;
  }

  if (
    contrastRatio(palette.ink, palette.background) < MIN_CONTRAST_RATIO ||
    contrastRatio(palette.ink, palette.surface) < MIN_CONTRAST_RATIO
  ) {
    return DEFAULT_DESIGN_SYSTEM.palette;
  }

  return palette;
};

/**
 * Series colours must be distinguishable from one another, which is a
 * different requirement from the deck palette's harmony. When the model gives
 * too few, pad from the default chart palette rather than from the deck's own
 * muted and ink: grey against near-black is harmonious and unreadable.
 */
const normalizeChartPalette = (raw, palette) => {
  const seen = new Set();
  const colors = [];

  for (const value of Array.isArray(raw) ? raw : []) {
    const hex = normalizeHex(value);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    colors.push(hex);
    if (colors.length === 5) break;
  }

  for (const fallback of [...DEFAULT_CHART_PALETTE, palette.accent, palette.muted, palette.ink]) {
    if (colors.length >= 3) break;
    if (seen.has(fallback)) continue;
    seen.add(fallback);
    colors.push(fallback);
  }

  return colors;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Clamp each step into its band, then force a strictly descending scale.
 *
 * A scale whose body is larger than its subtitle reads as a mistake on every
 * page at once, and no per-page repair can undo it, so ordering is repaired
 * here rather than trusted.
 */
const normalizeTypeScale = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const scale = {};

  for (const key of TYPE_SCALE_ORDER) {
    const [min, max] = TYPE_SCALE_BOUNDS[key];
    const value = toFiniteNumber(source[key]);
    scale[key] = value == null ? DEFAULT_DESIGN_SYSTEM.typeScale[key] : Math.round(clamp(value, min, max));
  }

  for (let index = 1; index < TYPE_SCALE_ORDER.length; index += 1) {
    const key = TYPE_SCALE_ORDER[index];
    const previous = scale[TYPE_SCALE_ORDER[index - 1]];
    if (scale[key] >= previous) {
      const [min, max] = TYPE_SCALE_BOUNDS[key];
      scale[key] = clamp(Math.min(previous - 1, max), min, max);
    }
  }

  return scale;
};

/**
 * The grid is expressed as insets from the canvas edge. It may be tighter than
 * the safe area but never looser, because the safe area is what the quality
 * gate enforces.
 */
const normalizeGrid = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawMargin = source.margin && typeof source.margin === "object" ? source.margin : {};
  const fallback = DEFAULT_DESIGN_SYSTEM.grid;

  const minLeft = FRAME_SAFE_AREA.left;
  const minTop = FRAME_SAFE_AREA.top;
  const minRight = DECK_CANVAS_WIDTH - FRAME_SAFE_AREA.right;
  const minBottom = DECK_CANVAS_HEIGHT - FRAME_SAFE_AREA.bottom;

  const readInset = (value, min, key) => {
    const number = toFiniteNumber(value);
    if (number == null) return fallback.margin[key];
    return Math.round(Math.max(min, number));
  };

  const margin = {
    top: readInset(rawMargin.top, minTop, "top"),
    right: readInset(rawMargin.right, minRight, "right"),
    bottom: readInset(rawMargin.bottom, minBottom, "bottom"),
    left: readInset(rawMargin.left, minLeft, "left"),
  };

  if (
    DECK_CANVAS_WIDTH - margin.left - margin.right < MIN_CONTENT_WIDTH ||
    DECK_CANVAS_HEIGHT - margin.top - margin.bottom < MIN_CONTENT_HEIGHT
  ) {
    return fallback;
  }

  const columns = toFiniteNumber(source.columns);
  const gutter = toFiniteNumber(source.gutter);
  const titleBaseline = toFiniteNumber(source.titleBaseline);
  const rhythm = String(source.rhythm == null ? "" : source.rhythm).trim();

  const resolvedBaseline =
    titleBaseline == null ? fallback.titleBaseline : Math.round(clamp(titleBaseline, 80, 260));

  return {
    margin,
    columns: columns == null ? fallback.columns : Math.round(clamp(columns, 6, 12)),
    gutter: gutter == null ? fallback.gutter : Math.round(clamp(gutter, 12, 48)),
    titleBaseline: Math.max(resolvedBaseline, margin.top),
    rhythm: rhythm || fallback.rhythm,
  };
};

const normalizeRules = (raw) => {
  const rules = (Array.isArray(raw) ? raw : [])
    .map((rule) => String(rule == null ? "" : rule).trim())
    .filter(Boolean)
    .slice(0, 5);
  return rules.length > 0 ? rules : [...DEFAULT_DESIGN_SYSTEM.rules];
};

const normalizeDesignSystem = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const palette = normalizePalette(source.palette);
  const text = (value, fallback) => {
    const trimmed = String(value == null ? "" : value).trim();
    return trimmed || fallback;
  };

  return {
    name: text(source.name, DEFAULT_DESIGN_SYSTEM.name).slice(0, 60),
    palette,
    chartPalette: normalizeChartPalette(source.chartPalette, palette),
    typeScale: normalizeTypeScale(source.typeScale),
    grid: normalizeGrid(source.grid),
    decoration: text(source.decoration, DEFAULT_DESIGN_SYSTEM.decoration).slice(0, 200),
    rules: normalizeRules(source.rules),
    artDirection: text(source.artDirection ?? source.art_direction, DEFAULT_DESIGN_SYSTEM.artDirection).slice(0, 300),
  };
};

const buildDesignSystemPrompt = ({ templateSpecs } = {}) => {
  const specs = Array.isArray(templateSpecs) ? templateSpecs.filter(Boolean) : [];
  const guidance =
    specs.length > 0
      ? `\n\n這份簡報必須遵守以下設計範本規範，你的設計系統要把它翻譯成具體數值：\n\n${specs
          .map((spec) => `【${spec.kind}／${spec.id}】\n${spec.spec}`)
          .join("\n\n")}`
      : "";

  return `你是簡報的美術總監。請為這一份簡報訂定一套全篇共用的設計系統。
這套系統會被逐頁套用，而每一頁是分開產生的，所以它必須明確到不同頁面各自套用時仍會長得像同一份簡報。

規則：
- 色彩一律使用大寫六碼 #RRGGBB。
- ink 對 background、ink 對 surface 都必須有足夠對比，確保投影時看得清楚。
- 字級是無單位數字，且必須 display > title > subtitle > body > caption。
- grid.margin 是距離畫布四邊的內縮距離（畫布 ${DECK_CANVAS_WIDTH}×${DECK_CANVAS_HEIGHT}），
  left 與 right 至少 ${FRAME_SAFE_AREA.left}，top 與 bottom 至少 ${DECK_CANVAS_HEIGHT - FRAME_SAFE_AREA.bottom}。
- grid.titleBaseline 是全份頁標題共用的基線 y，讓每頁標題落在同一個高度。
- decoration 描述全份共用的幾何語彙，rules 是 3 到 5 條每頁都要遵守的具體規則。
- artDirection 是一句英文，描述配圖的視覺調性。
- 設計要服務內容，不要為裝飾而裝飾。${guidance}

請只回傳 JSON：
{"name":"設計系統名稱","palette":{"background":"#FFFFFF","surface":"#F4F5F7","ink":"#1A1D21","muted":"#5B6169","accent":"#2F6FEB","accentSoft":"#DCE7FD"},"chartPalette":["#2F6FEB","#F2994A","#27AE60"],"typeScale":{"display":84,"title":44,"subtitle":24,"body":19,"caption":14},"grid":{"margin":{"top":88,"right":104,"bottom":88,"left":104},"columns":12,"gutter":24,"titleBaseline":148,"rhythm":"一句話說明垂直節奏"},"decoration":"全份共用的幾何語彙","rules":["每頁都要遵守的規則"],"artDirection":"English sentence for illustrations"}`;
};

const buildDesignSystemUserMessage = ({ deckTitle, summary, slides = [], brief } = {}) => {
  const roster = slides
    .slice(0, 24)
    .map((slide) => `${slide.slide_number}. [${slide.page_role}] ${slide.title}`)
    .join("\n");
  const task = [
    brief?.purpose ? `簡報目的：${brief.purpose}` : "",
    brief?.audience ? `聽眾對象：${brief.audience}` : "",
    brief?.outcome ? `期望成果：${brief.outcome}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `簡報標題：${deckTitle}
一句話摘要：${summary || "（無）"}
${task ? `${task}\n` : ""}頁面清單：
${roster || "（無）"}

請為這份簡報訂定設計系統。`;
};

const columnWidth = (grid) => {
  const contentWidth = DECK_CANVAS_WIDTH - grid.margin.left - grid.margin.right;
  const totalGutter = grid.gutter * (grid.columns - 1);
  return Math.round(((contentWidth - totalGutter) / grid.columns) * 100) / 100;
};

/**
 * The design system as authoring instructions.
 *
 * Written as hard numbers rather than adjectives: this text is the only thing
 * standing between independently authored pages and a deck that looks like a
 * collection of unrelated slides.
 */
const describeDesignSystem = (system) => {
  const { palette, typeScale, grid, chartPalette } = system;
  const contentRight = DECK_CANVAS_WIDTH - grid.margin.right;
  const contentBottom = DECK_CANVAS_HEIGHT - grid.margin.bottom;

  return `# 本份簡報的設計系統：${system.name}
這套系統對全份簡報有效。每一頁都是分開產生的，所以以下數值必須逐頁完全一致，不可自行調整。

## 色票（只能使用這些顏色）
- 頁面背景 background：${palette.background}
- 區塊底色 surface：${palette.surface}
- 主要文字 ink：${palette.ink}
- 次要文字 muted：${palette.muted}
- 強調色 accent：${palette.accent}
- 淺強調 accentSoft：${palette.accentSoft}
- 資料數列依序使用：${chartPalette.join("、")}

## 字級（無單位數字，不可自行插入中間級距）
- 封面主標 display：${typeScale.display}
- 頁標題 title：${typeScale.title}
- 副標與小節標 subtitle：${typeScale.subtitle}
- 內文 body：${typeScale.body}
- 註解與標籤 caption：${typeScale.caption}

## 版面網格（跨頁一致性的來源）
- 內容區左緣 x=${grid.margin.left}，右緣 x=${contentRight}，上緣 y=${grid.margin.top}，下緣 y=${contentBottom}
- ${grid.columns} 欄，欄距 ${grid.gutter}，單欄寬約 ${columnWidth(grid)}
- 每個區塊的左右緣都要落在欄線上；跨欄時寬度＝欄寬×欄數＋欄距×(欄數-1)
- 頁標題基線固定 y=${grid.titleBaseline}，全份簡報的頁標題都從這個高度開始
- 垂直節奏：${grid.rhythm}
- 滿版元素（背景圖、滿版色塊）可以不受內容區限制，但必須加上 data-pptx-bleed="true"

## 幾何語彙
${system.decoration}

## 全份規則
${system.rules.map((rule, index) => `${index + 1}. ${rule}`).join("\n")}`;
};

module.exports = {
  DEFAULT_DESIGN_SYSTEM,
  MIN_CONTRAST_RATIO,
  buildDesignSystemPrompt,
  buildDesignSystemUserMessage,
  contrastRatio,
  describeDesignSystem,
  normalizeDesignSystem,
};
