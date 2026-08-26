/**
 * Preview-only transforms for authored slide SVGs.
 *
 * The same boundary `deckPreview.js` keeps applies here: whatever we do to make
 * an SVG render in a browser must never touch the bytes we hand to the sidecar.
 * These helpers run after `checkDeck` has already passed, on a copy that is
 * written to `public/` and never returned to the compiler.
 */

/** The stack every authored slide uses, set by `buildFontGuidance`. */
const SERVER_FONT_STACK =
  "'Noto Sans CJK TC', 'Noto Sans', 'DejaVu Sans', sans-serif";

/**
 * `Noto Sans CJK TC` is installed on the sidecar, not on the user's machine, so
 * a verbatim preview falls back to a system font with different metrics and the
 * layout looks worse than the PPTX it represents. Naming the common per-platform
 * Chinese faces first keeps the preview honest about spacing.
 */
const BROWSER_FONT_STACK =
  "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', 'Hiragino Sans', system-ui, sans-serif";

const FONT_FAMILY_ATTRIBUTE = /font-family\s*=\s*"([^"]*)"/g;

const substitutePreviewFonts = (svg) =>
  String(svg || "").replace(FONT_FAMILY_ATTRIBUTE, () => `font-family="${BROWSER_FONT_STACK}"`);

const PREVIEW_KIND_DIRECTORIES = Object.freeze({
  style: "styles",
  layout: "layouts",
});

const previewFileName = (templateId, slideNumber) => `${templateId}-${slideNumber}.svg`;

const previewPublicPath = (kind, templateId, slideNumber) =>
  `/template-previews/${PREVIEW_KIND_DIRECTORIES[kind]}/${previewFileName(templateId, slideNumber)}`;

/**
 * Builds the manifest module from what is actually on disk rather than from
 * what the run intended to produce, so a half-finished run cannot leave the
 * frontend pointing at files that were never written.
 */
const buildManifestSource = (previews) => {
  const render = (group) =>
    Object.keys(group)
      .sort()
      .map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(group[id])},`)
      .join("\n");

  return `/**
 * 產生檔，請勿手動編輯。
 *
 * 由 \`node api/scripts/generate-style-previews.cjs\` 依真實產生流程輸出。
 * 升級 PPT_MASTER_VERSION、改動設計系統或骨架之後必須重跑，否則預覽會與實際產出脫節。
 */
export const TEMPLATE_PREVIEWS = {
  styles: {
${render(previews.styles || {})}
  },
  layouts: {
${render(previews.layouts || {})}
  },
};

export const describeTemplatePreview = (kind, templateId) =>
  TEMPLATE_PREVIEWS[kind]?.[templateId] || [];
`;
};

module.exports = {
  BROWSER_FONT_STACK,
  PREVIEW_KIND_DIRECTORIES,
  SERVER_FONT_STACK,
  buildManifestSource,
  previewFileName,
  previewPublicPath,
  substitutePreviewFonts,
};
