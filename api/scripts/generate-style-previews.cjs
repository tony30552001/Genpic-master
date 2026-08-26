/**
 * Renders a visual preview of every PPT Master design template.
 *
 * Most users leave the style picker on "由 AI 決定" because twelve text
 * descriptions are not a basis for choosing a design. This script produces the
 * missing evidence, and it does so by running the *real* pipeline — design
 * system, free-form authoring, the local contract repair loop and the sidecar
 * quality gate — so a preview cannot promise something generation would not
 * deliver.
 *
 * Every template is rendered from the same two-page outline, so the only
 * variable between two previews is the design language itself.
 *
 * The layout is authored freely on every run, so a preview is a *sample*, not a
 * guarantee: rerunning the same template gives a different arrangement. What it
 * does convey faithfully is colour, type scale, decorative vocabulary and
 * overall tone — which is what the user is actually choosing.
 *
 * Usage:
 *   node api/scripts/generate-style-previews.cjs --tenant <uuid> [--kind style|layout] [--only <id>]
 *
 *   --tenant  tenant whose model policy supplies the authoring model (required)
 *   --kind    render only one template kind (default: both)
 *   --only    render only this template id
 *
 * Requires DATABASE_URL and the PPT_MASTER_SERVICE_* settings. This is an ops
 * tool: nothing here is reachable from a runtime path.
 */

const fs = require("node:fs/promises");
const path = require("node:path");

const pptMaster = require("../_shared/pptMasterClient");
const { authorDeck, generateDesignSystem } = require("../_shared/deckAuthor");
const { buildAuthoringSystemPrompt } = require("../_shared/svgAuthoringPrompt");
const { normalizeOutline, DECK_CANVAS_FORMAT } = require("../_shared/deckContract");
const { resolveRoleModel } = require("../_shared/llmModels");
const { getPool } = require("../_shared/db");
const { PREVIEW_OUTLINE } = require("./previewOutline");
const {
  PREVIEW_KIND_DIRECTORIES,
  buildManifestSource,
  previewFileName,
  previewPublicPath,
  substitutePreviewFonts,
} = require("./previewAssets");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PREVIEW_ROOT = path.join(REPO_ROOT, "public", "template-previews");
const MANIFEST_PATH = path.join(
  REPO_ROOT,
  "src",
  "components",
  "create",
  "templatePreviewManifest.js"
);

const readArg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
};

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const tenantId = readArg("tenant");
const onlyKind = readArg("kind");
const onlyId = readArg("only");

if (!tenantId) fail("Missing --tenant <uuid>");
if (onlyKind && !PREVIEW_KIND_DIRECTORIES[onlyKind]) {
  fail(`Invalid --kind: ${onlyKind} (expected style or layout)`);
}
if (!process.env.DATABASE_URL) fail("Missing DATABASE_URL");
if (!pptMaster.isConfigured()) fail("Missing PPT_MASTER_SERVICE_URL / PPT_MASTER_SERVICE_KEY");

const listTemplateIds = async (kind) => {
  const catalog = await pptMaster.getCatalog();
  const entries = Array.isArray(catalog?.[kind]) ? catalog[kind] : [];
  return entries
    .filter((entry) => kind !== "layout" || String(entry?.canvas_format || "") === DECK_CANVAS_FORMAT)
    .map((entry) => String(entry?.id || ""))
    .filter(Boolean)
    .filter((id) => !onlyId || id === onlyId)
    .sort();
};

/**
 * Runs one template all the way to a passing deck. Anything short of that —
 * a failed contract loop, a rejected quality gate — throws, and the caller
 * records the template as skipped rather than writing a preview of a deck that
 * would not have shipped.
 */
const renderTemplate = async ({ kind, templateId, llm, fonts }) => {
  const spec = await pptMaster.getTemplateSpec({ kind, templateId });
  const templateSpecs = [spec];
  const outline = normalizeOutline(PREVIEW_OUTLINE, {
    slideCount: PREVIEW_OUTLINE.slides.length,
  });

  const designSystem = await generateDesignSystem({ outline, templateSpecs, brief: {}, llm });

  const deck = await pptMaster.createDeck({ name: "pixora_preview" });
  const svgBySlide = new Map();
  try {
    // authorDeck runs the local contract loop *and* the sidecar checkDeck gate,
    // and throws unless the whole deck passes — so nothing is written to
    // public/ that generation itself would have rejected. Only exportDeck is
    // skipped: a preview needs the SVGs, not a PPTX.
    await authorDeck({
      deckId: deck.deckId,
      outline,
      imagesBySlide: {},
      llm,
      systemMessage: buildAuthoringSystemPrompt({
        fontFamilies: fonts?.families,
        templateSpecs,
        designSystem,
      }),
      onSlidePreview: ({ slideNumber, svg }) => svgBySlide.set(slideNumber, svg),
    });
  } finally {
    await pptMaster
      .deleteDeck({ deckId: deck.deckId })
      .catch((error) => console.warn(`  cleanup failed: ${error.message}`));
  }

  const directory = path.join(PREVIEW_ROOT, PREVIEW_KIND_DIRECTORIES[kind]);
  await fs.mkdir(directory, { recursive: true });
  for (const [slideNumber, svg] of [...svgBySlide.entries()].sort((a, b) => a[0] - b[0])) {
    await fs.writeFile(
      path.join(directory, previewFileName(templateId, slideNumber)),
      substitutePreviewFonts(svg),
      "utf8"
    );
  }

  return { designSystemName: designSystem.name, slides: svgBySlide.size };
};

/**
 * The manifest is derived from the files that survived on disk, not from the
 * run's intentions, so an aborted run or a deleted asset can never leave the
 * picker requesting a preview that is not there.
 */
const writeManifest = async () => {
  const previews = { styles: {}, layouts: {} };
  for (const [kind, directoryName] of Object.entries(PREVIEW_KIND_DIRECTORIES)) {
    const directory = path.join(PREVIEW_ROOT, directoryName);
    const files = await fs.readdir(directory).catch(() => []);
    for (const file of files.sort()) {
      const match = /^(.+)-(\d+)\.svg$/.exec(file);
      if (!match) continue;
      const [, templateId, slideNumber] = match;
      const group = previews[directoryName];
      group[templateId] = group[templateId] || [];
      group[templateId].push(previewPublicPath(kind, templateId, Number(slideNumber)));
    }
  }
  await fs.writeFile(MANIFEST_PATH, buildManifestSource(previews), "utf8");
  return previews;
};

const run = async () => {
  const kinds = onlyKind ? [onlyKind] : ["style", "layout"];
  const [llm, fonts] = await Promise.all([
    resolveRoleModel(tenantId, "deck_authoring"),
    pptMaster.getFonts(),
  ]);

  const skipped = [];
  for (const kind of kinds) {
    const templateIds = await listTemplateIds(kind);
    console.log(`\n${kind}: ${templateIds.length} template(s)`);
    for (const templateId of templateIds) {
      process.stdout.write(`  ${templateId} … `);
      try {
        const result = await renderTemplate({ kind, templateId, llm, fonts });
        console.log(`${result.slides} page(s), 設計系統「${result.designSystemName}」`);
      } catch (error) {
        console.log(`FAILED: ${error.message}`);
        skipped.push(`${kind}/${templateId}`);
      }
    }
  }

  const previews = await writeManifest();
  const total =
    Object.keys(previews.styles).length + Object.keys(previews.layouts).length;
  console.log(`\nManifest written with ${total} template(s): ${MANIFEST_PATH}`);
  if (skipped.length > 0) {
    console.log(`Skipped (no preview written): ${skipped.join(", ")}`);
  }
};

run()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await getPool().end().catch(() => {});
  });
