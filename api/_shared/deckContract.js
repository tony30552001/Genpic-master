const DECK_MIN_SLIDES = 4;
const DECK_MAX_SLIDES = 12;
const DECK_CANVAS_WIDTH = 1280;
const DECK_CANVAS_HEIGHT = 720;
/** The sidecar renders every deck on this canvas, so 1280x720 is the only geometry we author. */
const DECK_CANVAS_FORMAT = "ppt169";
const DECK_MAX_REPAIR_ROUNDS = 3;

/** The stages the worker reports and the browser renders as a timeline. */
const DECK_STEPS = ["source", "outline", "images", "slides", "quality", "export"];

const DECK_STEP_LABELS = {
  source: "解析素材",
  outline: "規劃簡報大綱",
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
 * What an illustration does on the page. The outline picks one so both the
 * image prompt and the slide authoring prompt agree on how much room the
 * picture owns.
 */
const DECK_IMAGE_ROLES = Object.freeze(["background", "hero", "accent"]);

/** Fallback role per page role, used when the model omits or invents one. */
const DEFAULT_IMAGE_ROLE_BY_PAGE = Object.freeze({
  cover: "background",
  section: "hero",
  toc: "accent",
  content: "accent",
  ending: "accent",
});

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

const normalizeImageRole = (value, pageRole) => {
  const role = toText(value).toLowerCase();
  if (DECK_IMAGE_ROLES.includes(role)) return role;
  return DEFAULT_IMAGE_ROLE_BY_PAGE[pageRole] || "accent";
};

const normalizeOutlineSlide = (slide, index, total) => {
  const raw = slide && typeof slide === "object" && !Array.isArray(slide) ? slide : {};
  const pageRole = normalizePageRole(raw.page_role ?? raw.pageRole, index, total);
  return {
    slide_number: index + 1,
    page_role: pageRole,
    title: toText(raw.title) || `投影片 ${index + 1}`,
    subtitle: toText(raw.subtitle),
    key_points: normalizeTextArray(raw.key_points ?? raw.keyPoints).slice(0, 5),
    speaker_notes: toText(raw.speaker_notes ?? raw.speakerNotes),
    needs_image: Boolean(raw.needs_image ?? raw.needsImage),
    image_role: normalizeImageRole(raw.image_role ?? raw.imageRole, pageRole),
    image_prompt: toText(raw.image_prompt ?? raw.imagePrompt),
  };
};

const normalizeOutline = (outline, { slideCount } = {}) => {
  const raw = outline && typeof outline === "object" ? outline : {};
  const slides = Array.isArray(raw.slides) ? raw.slides : [];
  const limited = slides.slice(0, slideCount || DECK_MAX_SLIDES);
  const total = limited.length;

  return {
    title: toText(raw.title) || "未命名簡報",
    summary: toText(raw.summary),
    art_direction: toText(raw.art_direction ?? raw.artDirection),
    slides: limited.map((slide, index) => normalizeOutlineSlide(slide, index, total)),
  };
};

/** How many pages `key` density illustrates: about a third, never fewer than 2. */
const keyDensityTarget = (total) =>
  Math.min(5, Math.max(2, Math.round(total / 3)));

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
    if (!wanted) {
      return { ...slide, needs_image: false, image_prompt: "" };
    }

    let prompt = slide.image_prompt;
    if (!prompt) {
      prompt = synthesizeImagePrompt(outline.title, slide);
      synthesizedPrompts.push(slide.slide_number);
    }
    return { ...slide, needs_image: true, image_prompt: prompt };
  });

  return {
    outline: { ...outline, slides: decidedSlides },
    density: normalizedDensity,
    synthesizedPrompts,
  };
};


/**
 * Collect the `<g>` elements that are direct children of the root `<svg>`.
 * Those are the modules the quality gate requires to carry a unique `id` and
 * a `data-pptx-bounds` rectangle.
 */
const collectRootGroups = (content) => {
  const groups = [];
  const tagPattern = /<(\/?)([A-Za-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(content)) !== null) {
    const [, closing, name, attributes, selfClosing] = match;

    if (closing) {
      depth -= 1;
      continue;
    }
    if (name === "g" && depth === 1) {
      groups.push(attributes);
    }
    if (!selfClosing) {
      depth += 1;
    }
  }

  return groups;
};

const BOUNDS_VALUE = /^-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){3}$/;

const inspectRootGroups = (content) => {
  const problems = [];
  const seenIds = new Set();

  for (const attributes of collectRootGroups(content)) {
    const id = attributes.match(/\sid="([^"]*)"/)?.[1];
    if (!id) {
      problems.push("每個直屬根 <svg> 的 <g> 都必須有唯一且具描述性的 id");
    } else if (seenIds.has(id)) {
      problems.push(`<g> 的 id 重複：${id}`);
    } else {
      seenIds.add(id);
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
    } else if (
      x < 0 ||
      y < 0 ||
      x + width > DECK_CANVAS_WIDTH ||
      y + height > DECK_CANVAS_HEIGHT
    ) {
      problems.push(
        `data-pptx-bounds 必須落在 ${DECK_CANVAS_WIDTH}x${DECK_CANVAS_HEIGHT} 畫布內：${bounds}`
      );
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
  DECK_DEFAULT_IMAGE_DENSITY,
  DECK_IMAGE_DENSITIES,
  DECK_IMAGE_ROLES,
  DECK_STEPS,
  DECK_STEP_LABELS,
  DECK_MAX_REPAIR_ROUNDS,
  DECK_MAX_SLIDES,
  DECK_MIN_SLIDES,
  PAGE_ROLES,
  applyImagePolicy,
  inspectSlideSvg,
  normalizeImageDensity,
  normalizeOutline,
  normalizeSlideCount,
  slideFileName,
};
