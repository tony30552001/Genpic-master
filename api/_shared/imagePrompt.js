/**
 * Final image prompt assembly.
 *
 * The browser sends the creative inputs (content, style, purpose, text
 * language); the backend owns how they become one prompt. Keeping the assembly
 * here is what lets the general editor, the storyboard scenes, and the image
 * transform surface share the same wording and the same language directive.
 *
 * The image models are instruction-following: the assembled prompt is prose,
 * never a comma-delimited keyword list.
 */

const { buildGenerationTextDirective } = require("./imageTextLanguage");
const { describeCanvas } = require("./imagePromptStrategy");

/** Backend-owned deliverable and composition rules for each creation mode. */
const PURPOSE_PROMPT_SECTIONS = Object.freeze({
  infographic: Object.freeze({
    deliverable: "Create one polished infographic or presentation visual.",
    composition:
      "Unless the content already specifies framing, use a clear visual hierarchy, readable grouping, and balanced negative space. Keep the primary message immediately scannable and avoid decorative clutter or generic stock-photo staging.",
  }),
  storyboard: Object.freeze({
    deliverable: "Create one cinematic storyboard frame.",
    composition:
      "Unless the content already specifies framing, use a deliberate camera angle, clear spatial relationships, believable depth, and an action-focused composition that reads as one moment rather than a poster.",
  }),
  freeform: Object.freeze({ deliverable: "", composition: "" }),
});

const DEFAULT_IMAGE_PURPOSE = "infographic";
const IMAGE_PURPOSES = Object.freeze(Object.keys(PURPOSE_PROMPT_SECTIONS));

const normalizeImagePurpose = (value) => {
  const purpose = String(value || "").trim().toLowerCase();
  return IMAGE_PURPOSES.includes(purpose) ? purpose : DEFAULT_IMAGE_PURPOSE;
};

const normalizeTags = (tags) => {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))
  );
};

/** Ends a clause so the assembled prose does not run its sentences together. */
const asSentence = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return /[.!?。！？]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

const asSection = (label, text) => {
  const content = String(text || "").trim();
  return content ? `${label}: ${content}` : "";
};

const buildStyleBrief = (style, tags) => [
  style ? asSentence(style) : "",
  tags.length > 0 ? `Additional cues: ${tags.join(", ")}.` : "",
].filter(Boolean).join(" ");

const buildCanvasDirective = (aspectRatio, action = "compose") => {
  const canvas = describeCanvas(aspectRatio);
  if (canvas === "not specified") return "";
  return action === "edit"
    ? `Fit the result to the requested ${canvas} canvas without distorting preserved subjects. Extend or crop the background only as needed.`
    : `Compose for the requested ${canvas} canvas and keep important subjects, labels, and edges comfortably inside the frame.`;
};

const CONTENT_REFERENCE_DIRECTIVE =
  "Treat input image 1 as the content reference. Preserve the identity, product geometry, proportions, labels, and defining visual features of any subject the request reuses. Change only what the Content section explicitly requests. Do not copy unrelated text, logos, watermarks, or background elements.";

/**
 * Builds the prompt for a text-to-image generation.
 *
 * `stylePrompt` is the prose style description produced by style analysis or a
 * saved style; `styleTags` are the palette cues picked in the UI and stay a
 * separate clause so they never dilute that prose.
 *
 * The `freeform` purpose adds no deliverable-specific composition defaults, but
 * still applies explicit canvas, style, reference, and text-language settings.
 */
const buildImagePrompt = ({
  userScript,
  stylePrompt,
  styleTags,
  purpose,
  imageLanguage,
  aspectRatio,
  hasReferenceImage = false,
}) => {
  const content = String(userScript || "").trim();
  if (!content) {
    throw new Error("缺少 userScript");
  }

  const style = String(stylePrompt || "").trim();
  const tags = normalizeTags(styleTags);
  const resolvedPurpose = normalizeImagePurpose(purpose);
  const isFreeform = resolvedPurpose === "freeform";
  const styleBrief = buildStyleBrief(style, tags);

  const purposeBrief = PURPOSE_PROMPT_SECTIONS[resolvedPurpose];

  return [
    asSection("Deliverable", purposeBrief.deliverable),
    asSection("Content", asSentence(content)),
    hasReferenceImage ? asSection("Reference image", CONTENT_REFERENCE_DIRECTIVE) : "",
    asSection(
      "Composition and canvas",
      [isFreeform ? "" : purposeBrief.composition, buildCanvasDirective(aspectRatio)]
        .filter(Boolean)
        .join(" ")
    ),
    styleBrief ? asSection("Visual style", styleBrief) : "",
    asSection("Text", buildGenerationTextDirective(imageLanguage)),
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Builds the prompt for an image-to-image transform.
 *
 * Image models are not chat models, so each mode states the edit directly
 * instead of assigning the model a role to play.
 */
const buildTransformPrompt = ({
  mode,
  prompt,
  stylePrompt,
  styleTags,
  imageLanguage,
  aspectRatio,
}) => {
  const base = String(prompt || "").trim();
  const style = String(stylePrompt || "").trim();
  const tags = normalizeTags(styleTags);
  const styleBrief = buildStyleBrief(style, tags);

  let change;
  let preserve;
  let textDirective;
  switch (mode) {
    case "style_transfer":
      change = `Change only the rendering style to: ${[base, styleBrief].filter(Boolean).join(" ") || "a fresh artistic style"}.`;
      preserve = "Keep every subject, object, facial feature, product detail, proportion, pose, camera angle, layout, lighting direction, and spatial relationship unchanged.";
      textDirective = "Preserve all existing text and labels exactly as shown and do not add new text.";
      break;

    case "element_extract":
      change = `Move the main foreground subject into this new setting: ${base || "a new environment"}.`;
      preserve = "Preserve the extracted subject's identity, facial features, product geometry, proportions, clothing, labels, pose, and defining details. Adapt only environmental light and contact shadows so the subject belongs naturally in the new setting.";
      textDirective = buildGenerationTextDirective(imageLanguage);
      break;

    case "bg_replace":
      change = `Replace only the background with: ${base || "a new background"}.`;
      preserve = "Keep every foreground subject unchanged, including identity, product geometry, proportions, clothing, expression, pose, position, camera angle, and labels. Adapt only light interaction, reflections, and contact shadows needed to blend the new background naturally.";
      textDirective = "Preserve all existing foreground text and labels exactly as shown and do not add new text.";
      break;

    case "reference_gen":
    default:
      change = `Create the requested variation from the input image: ${base || "an original variation guided by the source image"}.`;
      preserve = "Use the source image as both a content and visual reference. Preserve defining subjects and composition when the request refers to them, and change only the differences the request states. Do not carry over unrelated text, logos, or watermarks.";
      textDirective = buildGenerationTextDirective(imageLanguage);
      break;
  }

  return [
    asSection("Edit", change),
    asSection("Preserve", preserve),
    styleBrief && mode !== "style_transfer" ? asSection("Visual style", styleBrief) : "",
    asSection("Canvas", buildCanvasDirective(aspectRatio, "edit")),
    asSection("Text", textDirective),
  ]
    .filter(Boolean)
    .join("\n");
};

module.exports = {
  DEFAULT_IMAGE_PURPOSE,
  IMAGE_PURPOSES,
  buildCanvasDirective,
  buildImagePrompt,
  buildTransformPrompt,
  normalizeImagePurpose,
};
