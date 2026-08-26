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
const {
  buildTemplateInstruction,
  normalizeTemplateContext,
} = require("./templateContext");

/** What the finished image is for, which decides how the frame is composed. */
const COMPOSITION_DIRECTIVES = Object.freeze({
  infographic:
    "Unless the description already specifies the framing, compose the frame so it works as an infographic or presentation slide, with a clear visual hierarchy and balanced negative space.",
  storyboard:
    "Unless the description already specifies the framing, compose the frame like a cinematic storyboard panel, with a deliberate camera angle and a believable sense of depth.",
  freeform: "",
});

const DEFAULT_IMAGE_PURPOSE = "infographic";
const IMAGE_PURPOSES = Object.freeze(Object.keys(COMPOSITION_DIRECTIVES));

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

/**
 * Builds the prompt for a text-to-image generation.
 *
 * `stylePrompt` is the prose style description produced by style analysis or a
 * saved style; `styleTags` are the palette cues picked in the UI and stay a
 * separate clause so they never dilute that prose.
 *
 * The `freeform` purpose sends the description untouched: no composition and no
 * text-language directive, because the author already wrote a complete brief.
 */
const buildImagePrompt = ({
  userScript,
  stylePrompt,
  styleTags,
  purpose,
  imageLanguage,
  templateContext,
}) => {
  const content = String(userScript || "").trim();
  if (!content) {
    throw new Error("缺少 userScript");
  }

  const style = String(stylePrompt || "").trim();
  const tags = normalizeTags(styleTags);
  const normalizedTemplateContext = normalizeTemplateContext(templateContext);
  const resolvedPurpose = normalizeImagePurpose(
    normalizedTemplateContext?.purpose || purpose
  );
  const isFreeform = resolvedPurpose === "freeform";
  const templateInstruction = buildTemplateInstruction(normalizedTemplateContext);

  return [
    style ? asSentence(`Render the whole image in this style: ${style}`) : "",
    tags.length > 0
      ? asSentence(`Apply these additional style cues: ${tags.join(", ")}`)
      : "",
    templateInstruction,
    asSentence(content),
    COMPOSITION_DIRECTIVES[resolvedPurpose],
    isFreeform ? "" : buildGenerationTextDirective(imageLanguage),
  ]
    .filter(Boolean)
    .join(" ");
};

/**
 * Builds the prompt for an image-to-image transform.
 *
 * Image models are not chat models, so each mode states the edit directly
 * instead of assigning the model a role to play.
 */
const buildTransformPrompt = ({ mode, prompt, imageLanguage }) => {
  const base = String(prompt || "").trim();

  let instruction;
  switch (mode) {
    case "style_transfer":
      instruction = `Redraw this image in the following artistic style: ${base || "a fresh artistic style"}. Keep every subject, object, and their spatial arrangement exactly as they appear in the source image. Change only the rendering style, brushwork, texture, and color treatment.`;
      break;

    case "element_extract":
      instruction = `Take the main foreground subjects out of this image and keep their appearance, details, and proportions exactly as they are. Place them into this new scene: ${base || "a new environment"}. Match the lighting direction, cast realistic shadows, and blend the subjects naturally into their new surroundings.`;
      break;

    case "bg_replace":
      instruction = `Replace only the background of this image with: ${base || "a new background"}. Keep the foreground subjects unchanged — the same appearance, clothing, expressions, pose, and position. Relight them so they match the new background and the result looks photorealistic.`;
      break;

    case "reference_gen":
    default:
      instruction = `Use this image only as a visual reference for its color palette, lighting, mood, and compositional structure. Create an entirely new image showing: ${base || "an original scene inspired by this reference"}. Keep the same aesthetic atmosphere and production quality, but none of the original content.`;
      break;
  }

  return [instruction, buildGenerationTextDirective(imageLanguage)]
    .filter(Boolean)
    .join(" ");
};

module.exports = {
  DEFAULT_IMAGE_PURPOSE,
  IMAGE_PURPOSES,
  buildImagePrompt,
  buildTransformPrompt,
  normalizeImagePurpose,
};
