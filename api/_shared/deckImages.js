const { generateGeminiImage } = require("./geminiImage");
const { uploadGeneratedBlob } = require("./blobStorage");
const pptMaster = require("./pptMasterClient");

const MIME_SUFFIXES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Blob copy of a deck illustration, used to inline images into slide previews. */
const deckImageBlobName = ({ jobId, name }) => `decks/${jobId}/images/${name}`;

/**
 * Generate the illustrations the outline asked for and upload them into the
 * deck workspace, so slide authoring can reference `../images/<name>`.
 *
 * A failed illustration must not fail the whole deck: the slide is simply
 * authored without an image, and the reason is reported as a failed step event
 * so the user can see which page lost its illustration.
 */
const generateDeckImages = async ({ deckId, jobId, outline, onProgress }) => {
  const wanted = outline.slides.filter(
    (slide) => slide.needs_image && slide.image_prompt
  );
  if (wanted.length === 0) {
    await onProgress?.({
      step: "images",
      status: "skipped",
      detail: "這份簡報不需要配圖",
    });
    return {};
  }

  await onProgress?.({
    step: "images",
    detail: `產生 ${wanted.length} 張配圖`,
    current: 0,
    total: outline.slides.length,
  });

  const imagesBySlide = {};
  let failed = 0;

  for (const [index, slide] of wanted.entries()) {
    await onProgress?.({
      step: "images",
      slideNumber: slide.slide_number,
      detail: `產生第 ${slide.slide_number} 頁配圖（${index + 1}／${wanted.length}）`,
    });

    try {
      const image = await generateGeminiImage({
        prompt: `${slide.image_prompt}\nA clean, professional presentation illustration. No text, no words, no letters, no watermark.`,
        aspectRatio: "16:9",
      });
      const suffix = MIME_SUFFIXES[image.mimeType] || "png";
      const name = `slide_${String(slide.slide_number).padStart(2, "0")}.${suffix}`;
      const buffer = Buffer.from(image.base64, "base64");

      await pptMaster.writeImage({
        deckId,
        name,
        buffer,
        contentType: image.mimeType,
      });

      /**
       * The sidecar workspace is deleted once the deck is exported, but the
       * preview endpoint still has to inline this image. Keep a copy in Blob
       * Storage; failing to do so only costs the preview its illustration.
       */
      await uploadGeneratedBlob({
        blobName: deckImageBlobName({ jobId, name }),
        buffer,
        contentType: image.mimeType,
      }).catch((uploadError) =>
        console.warn("[deck-jobs] Failed to store illustration for preview:", {
          slide: slide.slide_number,
          message: uploadError.message,
        })
      );

      imagesBySlide[slide.slide_number] = [name];
      await onProgress?.({
        step: "images",
        status: "succeeded",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁配圖完成`,
      });
    } catch (imageError) {
      failed += 1;
      console.warn("[deck-jobs] Illustration failed, authoring slide without it:", {
        slide: slide.slide_number,
        message: imageError.message,
      });
      await onProgress?.({
        step: "images",
        status: "failed",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁配圖失敗，改以純版面呈現`,
      });
    }
  }

  await onProgress?.({
    step: "images",
    status: "succeeded",
    detail:
      failed > 0
        ? `完成 ${wanted.length - failed}／${wanted.length} 張配圖，${failed} 張改以純版面呈現`
        : `完成 ${wanted.length} 張配圖`,
  });

  return imagesBySlide;
};

module.exports = { deckImageBlobName, generateDeckImages };
