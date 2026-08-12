const { generateGeminiImage } = require("./geminiImage");
const pptMaster = require("./pptMasterClient");

const MIME_SUFFIXES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * Generate the illustrations the outline asked for and upload them into the
 * deck workspace, so slide authoring can reference `../images/<name>`.
 *
 * A failed illustration must not fail the whole deck: the slide is simply
 * authored without an image, and the reason is logged.
 */
const generateDeckImages = async ({ deckId, outline, onProgress }) => {
  const wanted = outline.slides.filter(
    (slide) => slide.needs_image && slide.image_prompt
  );
  if (wanted.length === 0) return {};

  const imagesBySlide = {};

  for (const [index, slide] of wanted.entries()) {
    await onProgress?.({
      phase: `產生配圖 ${index + 1}／${wanted.length}`,
    });

    try {
      const image = await generateGeminiImage({
        prompt: `${slide.image_prompt}\nA clean, professional presentation illustration. No text, no words, no letters, no watermark.`,
        aspectRatio: "16:9",
      });
      const suffix = MIME_SUFFIXES[image.mimeType] || "png";
      const name = `slide_${String(slide.slide_number).padStart(2, "0")}.${suffix}`;

      await pptMaster.writeImage({
        deckId,
        name,
        buffer: Buffer.from(image.base64, "base64"),
        contentType: image.mimeType,
      });

      imagesBySlide[slide.slide_number] = [name];
    } catch (imageError) {
      console.warn("[deck-jobs] Illustration failed, authoring slide without it:", {
        slide: slide.slide_number,
        message: imageError.message,
      });
    }
  }

  return imagesBySlide;
};

module.exports = { generateDeckImages };
