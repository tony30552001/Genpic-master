const {
  FRAME_SAFE_AREA,
  getFrame,
  illustratedVariantOf,
  normalizeFrameId,
} = require("./deckFrames");

const DECK_MIN_SLIDES = 4;
const DECK_MAX_SLIDES = 20;
const DECK_CANVAS_WIDTH = 1280;
const DECK_CANVAS_HEIGHT = 720;
/** The sidecar renders every deck on this canvas, so 1280x720 is the only geometry we author. */
const DECK_CANVAS_FORMAT = "ppt169";
const DECK_MAX_REPAIR_ROUNDS = 3;

/** The stages the worker reports and the browser renders as a timeline. */
const DECK_STEPS = ["source", "outline", "design", "images", "slides", "quality", "export"];

const DECK_STEP_LABELS = {
  source: "解析素材",
  outline: "規劃簡報大綱",
  design: "建立設計系統",
  images: "產生配圖",
  slides: "逐頁設計版面",
  quality: "版面品質檢查",
  export: "匯出 PowerPoint",
};

const PAGE_ROLES = new Set(["cover", "toc", "section", "content", "ending"]);

/** How much of the deck gets an AI illustration. The user picks this. */
const DECK_IMAGE_DENSITIES = Object.freeze(["none", "key", "every"]);
const DECK_DEFAULT_IMAGE_DENSITY = "key";

/**
 * What an illustration does on the page. The frame declares this, because the
 * frame is what reserves the room for the picture.
 */
const DECK_IMAGE_ROLES = Object.freeze(["background", "hero", "accent"]);

const normalizeImageDensity = (value) => {
  const density = String(value || "").trim().toLowerCase();
  return DECK_IMAGE_DENSITIES.includes(density)
    ? density
    : DECK_DEFAULT_IMAGE_DENSITY;
};

const toText = (value, fallback = "") =>
  value == null ? fallback : String(value).trim();

const normalizeTextArray = (value) =>
  Array.isArray(value) ? value.map((item) => toText(item)).filter(Boolean) : [];

const normalizePageRole = (value, index, total) => {
  const role = toText(value).toLowerCase();
  if (PAGE_ROLES.has(role)) return role;
  if (index === 0) return "cover";
  if (index === total - 1) return "ending";
  return "content";
};

const normalizeSlideCount = (value) => {
  const count = Number.parseInt(value, 10);
  if (!Number.isFinite(count)) return 8;
  return Math.min(DECK_MAX_SLIDES, Math.max(DECK_MIN_SLIDES, count));
};

/** Slide file names must sort in presentation order inside svg_output/. */
const slideFileName = (index) =>
  `${String(index + 1).padStart(2, "0")}_slide.svg`;

/**
 * Bind a slide to a frame. The frame owns capacity and the illustration's job
 * on the page, so both follow it rather than the model's separate guesses.
 */
const withFrame = (slide, frameId) => {
  const frame = getFrame(frameId);
  return {
    ...slide,
    frame: frameId,
    key_points: slide.key_points.slice(0, frame.pointsRange[1]),
    image_role: frame.imageRole,
  };
};

/**
 * Chart types we let the outline request.
 *
 * These are spelled exactly as upstream's `_CATEGORY_CHART_TYPES`, because the
 * normalized value is serialized straight into the native replacement metadata.
 * Inventing our own vocabulary would mean a translation layer that can drift.
 * Upstream also supports XY and ChartEx families; deck pages only get the
 * category charts that read well at presentation distance.
 */
const DECK_CHART_TYPES = Object.freeze([
  "column",
  "bar",
  "line",
  "pie",
  "doughnut",
  "area",
]);

const DECK_TABLE_MAX_COLUMNS = 5;
const DECK_TABLE_MAX_ROWS = 6;
const DECK_CHART_MAX_CATEGORIES = 6;
const DECK_CHART_MAX_SERIES = 3;

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * A table the page can render and the exporter can replace with a native one.
 *
 * Partial data is worse than none: a table missing its rows renders as an empty
 * grid that the repair loop cannot fill, so anything malformed is dropped whole
 * and the page falls back to text.
 */
const normalizeSlideTable = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const headers = normalizeTextArray(raw.headers).slice(0, DECK_TABLE_MAX_COLUMNS);
  if (headers.length === 0) return null;

  const rows = (Array.isArray(raw.rows) ? raw.rows : [])
    .filter((row) => Array.isArray(row))
    .map((row) => row.slice(0, headers.length).map((cell) => toText(cell)))
    .filter((row) => row.some(Boolean))
    .slice(0, DECK_TABLE_MAX_ROWS)
    .map((row) => {
      const padded = [...row];
      while (padded.length < headers.length) padded.push("");
      return padded;
    });

  if (rows.length === 0) return null;

  return { title: toText(raw.title), headers, rows };
};

/**
 * A chart the page can draw and the exporter can replace with a native one.
 *
 * Series are truncated to the shortest common length rather than padded with
 * zeroes, because a fabricated zero is indistinguishable from a measured one
 * once it reaches a slide.
 */
const normalizeSlideChart = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const type = toText(raw.type).toLowerCase();
  if (!DECK_CHART_TYPES.includes(type)) return null;

  const categories = normalizeTextArray(raw.categories ?? raw.labels).slice(
    0,
    DECK_CHART_MAX_CATEGORIES
  );
  if (categories.length === 0) return null;

  const series = (Array.isArray(raw.series) ? raw.series : [])
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const values = (Array.isArray(entry.values) ? entry.values : [])
        .map(toFiniteNumber)
        .slice(0, categories.length);
      if (values.length !== categories.length) return null;
      return { name: toText(entry.name) || "數列", values };
    })
    .filter((entry) => entry && entry.values.every((value) => value != null))
    .slice(0, DECK_CHART_MAX_SERIES);

  if (series.length === 0) return null;

  /** Pie and doughnut render one ring; extra series would be silently ignored. */
  const limited = type === "pie" || type === "doughnut" ? series.slice(0, 1) : series;

  return { type, title: toText(raw.title), categories, series: limited };
};

const normalizeOutlineSlide = (slide, index, total, forcedRole) => {
  const raw = slide && typeof slide === "object" && !Array.isArray(slide) ? slide : {};
  const pageRole =
    forcedRole || normalizePageRole(raw.page_role ?? raw.pageRole, index, total);
  return withFrame(
    {
      slide_number: index + 1,
      page_role: pageRole,
      title: toText(raw.title) || `投影片 ${index + 1}`,
      subtitle: toText(raw.subtitle),
      key_points: normalizeTextArray(raw.key_points ?? raw.keyPoints),
      speaker_notes: toText(raw.speaker_notes ?? raw.speakerNotes),
      table: normalizeSlideTable(raw.table),
      chart: normalizeSlideChart(raw.chart),
      needs_image: Boolean(raw.needs_image ?? raw.needsImage),
      image_prompt: toText(raw.image_prompt ?? raw.imagePrompt),
    },
    normalizeFrameId(raw.frame, pageRole)
  );
};

/**
 * `spine` is the recipe's page-role sequence. It corrects roles the model drifted
 * on — a pitch deck whose call to action came back as a `content` page — but it
 * never touches titles, points or frames: the recipe knows the shape of the
 * argument, the model knows the material. A corrected role feeds straight into
 * `normalizeFrameId`, which drops any frame that no longer fits.
 */
const normalizeOutline = (outline, { slideCount, spine } = {}) => {
  const raw = outline && typeof outline === "object" ? outline : {};
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const limited = slides.slice(0, slideCount || DECK_MAX_SLIDES);
  const total = limited.length;
  const roles = Array.isArray(spine) && spine.length === total ? spine : null;

  return {
    title: toText(raw.title) || "未命名簡報",
    summary: toText(raw.summary),
    slides: limited.map((slide, index) =>
      normalizeOutlineSlide(slide, index, total, roles ? roles[index].role : null)
    ),
  };
};

/** How many pages `key` density illustrates: about a third, never fewer than 2. */
const keyDensityTarget = (total) =>
  Math.min(7, Math.max(2, Math.round(total / 3)));

/**
 * Rank the pages worth illustrating. A cover carries the deck's first
 * impression and a section divider is a deliberate visual pause, so both
 * outrank body pages; among body pages the outline's own judgement wins.
 */
const imageCandidateRank = (slide) => {
  if (slide.page_role === "cover") return 0;
  if (slide.page_role === "section") return 1;
  if (slide.needs_image) return 2;
  return 3;
};

/**
 * Synthesize an illustration brief for a page the policy selected but the
 * model left without one. Dropping the page silently is what made decks come
 * back unillustrated in the first place.
 */
const synthesizeImagePrompt = (deckTitle, slide) => {
  const parts = [deckTitle, slide.title, ...slide.key_points.slice(0, 2)]
    .map((part) => toText(part))
    .filter(Boolean);
  return `An editorial illustration for a presentation slide about: ${parts.join(" — ")}`;
};

/**
 * Keep the frame and the illustration decision consistent.
 *
 * The density policy runs after the outline committed to a frame, so it can
 * strand a page either way: a frame with an image module but no picture leaves
 * a hole, and a picture on a frame with nowhere to put it has no geometry to
 * occupy. Frames declare their illustrated and unillustrated siblings, so the
 * page moves to whichever one matches the decision.
 *
 * A frame whose structure carries the meaning has no illustrated sibling. Such
 * a page keeps its structure and gives up the picture: density is a target for
 * the deck, not a promise for every page.
 */
const reconcileFrameWithImage = (slide, wanted) => {
  const frame = getFrame(slide.frame);
  if (wanted === Boolean(frame.imageRole)) return slide;

  if (!wanted) {
    return withFrame(slide, frame.fallbackWithoutImage);
  }

  const illustrated = illustratedVariantOf(frame.id);
  if (!illustrated) return null;
  return withFrame(slide, illustrated);
};

/**
 * Decide which pages get an illustration.
 *
 * The outline model only nominates candidates and describes them; the count is
 * decided here so the same density always produces a comparable deck. Returns
 * the pages whose brief had to be synthesized so the worker can report them.
 */
const applyImagePolicy = ({ outline, density }) => {
  const normalizedDensity = normalizeImageDensity(density);
  const slides = outline.slides;

  let selected;
  if (normalizedDensity === "none") {
    selected = new Set();
  } else if (normalizedDensity === "every") {
    selected = new Set(slides.map((slide) => slide.slide_number));
  } else {
    const eligible = slides.filter((slide) => slide.page_role !== "ending");
    const ranked = [...eligible].sort(
      (a, b) => imageCandidateRank(a) - imageCandidateRank(b) || a.slide_number - b.slide_number
    );
    const target = Math.min(keyDensityTarget(slides.length), eligible.length);
    selected = new Set(ranked.slice(0, target).map((slide) => slide.slide_number));
  }

  const synthesizedPrompts = [];
  const decidedSlides = slides.map((slide) => {
    const wanted = selected.has(slide.slide_number);
    const reframed = reconcileFrameWithImage(slide, wanted);

    if (!wanted || !reframed) {
      return { ...(reframed || slide), needs_image: false, image_prompt: "" };
    }

    let prompt = reframed.image_prompt;
    if (!prompt) {
      prompt = synthesizeImagePrompt(outline.title, reframed);
      synthesizedPrompts.push(reframed.slide_number);
    }
    return { ...reframed, needs_image: true, image_prompt: prompt };
  });

  return {
    outline: { ...outline, slides: decidedSlides },
    density: normalizedDensity,
    synthesizedPrompts,
  };
};


/**
 * Collect the `<g>` elements that are direct children of the root `<svg>`,
 * with the markup each one encloses.
 *
 * The inner markup matters now that pages compose their own layout: whether a
 * module carries text decides how strictly it may overlap its neighbours, and
 * a native replacement marker has to be checked against its own children.
 */
const collectRootGroups = (content) => {
  const groups = [];
  const tagPattern = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let depth = 0;
  let open = null;
  let match;

  while ((match = tagPattern.exec(content)) !== null) {
    const [, closing, name, attributes, selfClosing] = match;

    if (closing) {
      if (open && depth === 2) {
        groups.push({ attributes: open.attributes, inner: content.slice(open.start, match.index) });
        open = null;
      }
      depth -= 1;
      continue;
    }
    if (name === "g" && depth === 1) {
      if (selfClosing) {
        groups.push({ attributes, inner: "" });
      } else {
        open = { attributes, start: match.index + match[0].length };
      }
    }
    if (!selfClosing) {
      depth += 1;
    }
  }

  return groups;
};

const BOUNDS_VALUE = /^-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){3}$/;

/**
 * Modules smaller than this are always a mistake rather than a design choice:
 * nothing legible fits, and the exporter still emits a shape for them.
 */
const MIN_MODULE_WIDTH = 40;
const MIN_MODULE_HEIGHT = 24;

/**
 * How much two text modules may overlap before it counts as a collision.
 *
 * Only text-bearing modules are compared. Text over text is always a mistake,
 * while text over a decorative panel is legitimate design, so restricting the
 * rule to text pairs is what keeps it from punishing good layouts.
 */
const MAX_TEXT_OVERLAP_RATIO = 0.15;

const NATIVE_REPLACEMENT_KINDS = Object.freeze(["chart", "table"]);

const rectangleOverlap = (first, second) => {
  const width = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const height = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
};

/**
 * Validate a native chart/table replacement marker.
 *
 * Upstream treats the visible SVG fallback, the marker and the JSON metadata as
 * one authoring unit, and export fails on a marker whose payload does not parse.
 * Catching that here turns a deck-level export failure into ordinary per-page
 * repair feedback.
 */
const inspectNativeMarker = (kind, inner, id) => {
  const label = `模組 <g id="${id || ""}">`;
  if (!NATIVE_REPLACEMENT_KINDS.includes(kind)) {
    return [`${label} 的 data-pptx-replace-with 只能是 ${NATIVE_REPLACEMENT_KINDS.join(" 或 ")}`];
  }

  const metadata = inner.match(
    /<metadata\b[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/metadata>/i
  );
  if (!metadata) {
    return [
      `${label} 帶有 data-pptx-replace-with="${kind}"，必須包含一個 <metadata type="application/json"> 子節點`,
    ];
  }

  let payload;
  try {
    payload = JSON.parse(metadata[1].trim());
  } catch {
    return [`${label} 的 <metadata> 內容不是合法 JSON`];
  }

  const problems = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return [`${label} 的 <metadata> 必須是一個 JSON 物件`];
  }
  if (kind === "chart" && !DECK_CHART_TYPES.includes(String(payload.type || "").toLowerCase())) {
    problems.push(
      `${label} 的 metadata type 必須是 ${DECK_CHART_TYPES.join("、")} 其中之一`
    );
  }
  if (kind === "table" && !Array.isArray(payload.rows) && !Array.isArray(payload.columns)) {
    problems.push(`${label} 的 metadata 必須包含 rows 或 columns`);
  }

  const withoutMetadata = inner.replace(
    /<metadata\b[\s\S]*?<\/metadata>/gi,
    ""
  );
  if (!/<(text|rect|path|circle|ellipse|line|polyline|polygon|image|g)\b/i.test(withoutMetadata)) {
    problems.push(
      `${label} 除了 <metadata> 之外還必須畫出完整可見的圖形，原生替換是附加資訊而不是替代品`
    );
  }

  return problems;
};

const inspectRootGroups = (content) => {
  const problems = [];
  const seenIds = new Set();
  const textBoxes = [];

  for (const { attributes, inner } of collectRootGroups(content)) {
    const id = attributes.match(/\sid="([^"]*)"/)?.[1];
    if (!id) {
      problems.push("每個直屬根 <svg> 的 <g> 都必須有唯一且具描述性的 id");
    } else if (seenIds.has(id)) {
      problems.push(`<g> 的 id 重複：${id}`);
    } else {
      seenIds.add(id);
    }

    const nativeKind = attributes.match(/\sdata-pptx-replace-with="([^"]*)"/)?.[1];
    if (nativeKind) {
      problems.push(...inspectNativeMarker(nativeKind.trim().toLowerCase(), inner, id));
    }

    const bounds = attributes.match(/\sdata-pptx-bounds="([^"]*)"/)?.[1];
    if (!bounds) {
      problems.push(
        `模組 <g${id ? ` id="${id}"` : ""}> 缺少 data-pptx-bounds="x y w h"`
      );
      continue;
    }
    if (!BOUNDS_VALUE.test(bounds.trim())) {
      problems.push(`data-pptx-bounds 必須是四個無單位數字：${bounds}`);
      continue;
    }

    const [x, y, width, height] = bounds.trim().split(/\s+/).map(Number);
    if (width <= 0 || height <= 0) {
      problems.push(`data-pptx-bounds 的寬高必須為正值：${bounds}`);
      continue;
    }
    if (
      x < 0 ||
      y < 0 ||
      x + width > DECK_CANVAS_WIDTH ||
      y + height > DECK_CANVAS_HEIGHT
    ) {
      problems.push(
        `data-pptx-bounds 必須落在 ${DECK_CANVAS_WIDTH}x${DECK_CANVAS_HEIGHT} 畫布內：${bounds}`
      );
      continue;
    }

    if (width < MIN_MODULE_WIDTH || height < MIN_MODULE_HEIGHT) {
      problems.push(
        `模組 <g id="${id || ""}"> 的尺寸過小（至少 ${MIN_MODULE_WIDTH}x${MIN_MODULE_HEIGHT}）：${bounds}`
      );
    }

    const bleed = /\sdata-pptx-bleed="true"/.test(attributes);
    if (
      !bleed &&
      (x < FRAME_SAFE_AREA.left ||
        y < FRAME_SAFE_AREA.top ||
        x + width > FRAME_SAFE_AREA.right ||
        y + height > FRAME_SAFE_AREA.bottom)
    ) {
      problems.push(
        `模組 <g id="${id || ""}"> 超出安全邊界（x ${FRAME_SAFE_AREA.left}–${FRAME_SAFE_AREA.right}、y ${FRAME_SAFE_AREA.top}–${FRAME_SAFE_AREA.bottom}）：${bounds}。` +
          '若這是刻意的滿版元素，請加上 data-pptx-bleed="true"'
      );
    }

    if (!bleed && /<text[\s>]/.test(inner)) {
      textBoxes.push({ id: id || "", x, y, width, height });
    }
  }

  for (let first = 0; first < textBoxes.length; first += 1) {
    for (let second = first + 1; second < textBoxes.length; second += 1) {
      const a = textBoxes[first];
      const b = textBoxes[second];
      const overlap = rectangleOverlap(a, b);
      if (overlap === 0) continue;
      const smaller = Math.min(a.width * a.height, b.width * b.height);
      if (overlap / smaller > MAX_TEXT_OVERLAP_RATIO) {
        problems.push(
          `文字模組 <g id="${a.id}"> 與 <g id="${b.id}"> 重疊過多，請調整位置或縮小其中一個`
        );
      }
    }
  }

  return problems;
};

/**
 * Cheap pre-flight checks that catch the most common authoring mistakes before
 * the SVG reaches the Python quality gate. The gate stays authoritative.
 */
const inspectSlideSvg = (svg) => {
  const problems = [];
  const content = toText(svg);

  if (!content.startsWith("<svg")) {
    problems.push("SVG 必須以 <svg 開頭，且不得包含 XML 宣告或 Markdown 圍欄");
  }
  if (!content.includes('xmlns="http://www.w3.org/2000/svg"')) {
    problems.push('根元素缺少 xmlns="http://www.w3.org/2000/svg"');
  }
  if (!content.includes(`viewBox="0 0 ${DECK_CANVAS_WIDTH} ${DECK_CANVAS_HEIGHT}"`)) {
    problems.push(`根元素必須是 viewBox="0 0 ${DECK_CANVAS_WIDTH} ${DECK_CANVAS_HEIGHT}"`);
  }

  const rootTag = content.slice(0, content.indexOf(">") + 1);
  if (/\stransform=/.test(rootTag)) {
    problems.push("根 <svg> 禁止使用 transform");
  }
  const roleMatch = rootTag.match(/data-pptx-page-role="([^"]*)"/);
  if (!roleMatch) {
    problems.push("根 <svg> 缺少 data-pptx-page-role");
  } else if (!PAGE_ROLES.has(roleMatch[1])) {
    problems.push(
      `data-pptx-page-role 必須是 ${Array.from(PAGE_ROLES).join("、")} 其中之一`
    );
  }

  for (const forbidden of [
    ["<style", "禁止 <style> 元素"],
    ["class=", "禁止 class 屬性"],
    ["<foreignObject", "禁止 <foreignObject>"],
    ["<textPath", "禁止 <textPath>"],
    ["@font-face", "禁止 @font-face"],
    ["<script", "禁止 <script>"],
    ["<animate", "禁止 SMIL 動畫"],
    ["<mask", "禁止 <mask>"],
    ["!important", "禁止 !important"],
  ]) {
    if (content.includes(forbidden[0])) problems.push(forbidden[1]);
  }

  for (const entity of ["&mdash;", "&nbsp;", "&hellip;", "&ndash;", "&copy;"]) {
    if (content.includes(entity)) {
      problems.push(`禁止 HTML 具名實體 ${entity}，請直接使用 Unicode 字元`);
    }
  }

  problems.push(...inspectRootGroups(content));

  return problems;
};

module.exports = {
  DECK_CANVAS_FORMAT,
  DECK_CANVAS_HEIGHT,
  DECK_CANVAS_WIDTH,
  DECK_CHART_TYPES,
  DECK_DEFAULT_IMAGE_DENSITY,
  DECK_IMAGE_DENSITIES,
  DECK_IMAGE_ROLES,
  DECK_STEPS,
  DECK_STEP_LABELS,
  DECK_MAX_REPAIR_ROUNDS,
  DECK_MAX_SLIDES,
  DECK_MIN_SLIDES,
  MAX_TEXT_OVERLAP_RATIO,
  MIN_MODULE_HEIGHT,
  MIN_MODULE_WIDTH,
  PAGE_ROLES,
  applyImagePolicy,
  inspectSlideSvg,
  keyDensityTarget,
  normalizeImageDensity,
  normalizeOutline,
  normalizeSlideChart,
  normalizeSlideCount,
  normalizeSlideTable,
  slideFileName,
};
