const { uploadGeneratedBlob } = require("./blobStorage");
const { renderImage } = require("./imageProviders");
const { resolveImageModel } = require("./imageModels");
const pptMaster = require("./pptMasterClient");

const MIME_SUFFIXES = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Keep image-provider fan-out small to limit rate pressure. */
const CONCURRENCY = 2;

/** Blob copy of a deck illustration, used to inline images into slide previews. */
const deckImageBlobName = ({ jobId, name }) => `decks/${jobId}/images/${name}`;

const ROLE_DIRECTION = {
  background:
    "Full-bleed background behind slide text. Use very low contrast, generous negative space, and no focal point in the centre.",
  hero: "Main visual occupying about half of the slide. Show one clear subject and weight the composition to one side so the other side remains usable for text.",
  accent: "Small supporting accent. Show one simple subject with an uncluttered silhouette and ample surrounding space.",
};

/**
 * The provider renders a 3:2 frame that the slide crops with
 * `preserveAspectRatio="slice"`, so anything that matters has to survive
 * losing the outer edges.
 */
const buildIllustrationPrompt = ({ slide, artDirection }) =>
  [
    "Deliverable: Create one clean, professional presentation illustration, not a complete slide or a stock-photo collage.",
    `Content: ${slide.image_prompt}`,
    `Slide role: ${ROLE_DIRECTION[slide.image_role] || ROLE_DIRECTION.accent}`,
    artDirection ? `Visual style: ${artDirection}` : "",
    "Canvas and crop: Compose for a wide frame. Keep every important subject within generous safe margins because the outer edges may be cropped.",
    "Constraints: Do not include text, labels, titles, letters, numbers, charts, logos, or watermarks. Do not invent factual data or citations.",
  ]
    .filter(Boolean)
    .join("\n");

/** Run tasks with a bounded fan-out so one slow provider call cannot serialize the rest. */
const mapWithConcurrency = async (items, limit, worker) => {
  let cursor = 0;

  const runner = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      await worker(items[index]);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner())
  );
};

/**
 * Generate the illustrations the outline policy asked for and upload them into
 * the deck workspace, so slide authoring can reference `../images/<name>`.
 *
 * A failed illustration must not fail the whole deck: the slide is simply
 * authored without an image, and the reason is reported as a failed step event
 * so the user can see which page lost its illustration.
 *
 * `artDirection` comes from the deck design system rather than the outline, so
 * illustrations and page layouts are governed by one description of the deck's
 * visual language instead of two that can drift apart.
 */
const generateDeckImages = async ({
  deckId,
  jobId,
  outline,
  artDirection,
  tenantId,
  modelKey,
  onProgress,
}) => {
  const wanted = outline.slides.filter(
    (slide) => slide.needs_image && slide.image_prompt
  );
  if (wanted.length === 0) {
    await onProgress?.({
      step: "images",
      status: "skipped",
      detail: "依設定不產生配圖，全部頁面以純版面呈現",
    });
    return {};
  }

  let config;
  try {
    config = await resolveImageModel({ tenantId, modelKey });
  } catch (error) {
    console.warn("[deck-jobs] Illustration configuration failed:", {
      jobId,
      modelKey,
      code: error.code,
    });
    const reason = error.code === "image_model_not_configured"
      ? "尚未設定"
      : "設定讀取失敗";
    await onProgress?.({
      step: "images",
      status: "failed",
      detail: `圖片生成模型 ${modelKey || "未指定"} ${reason}，${wanted.length} 頁改以純版面呈現`,
    });
    return {};
  }

  await onProgress?.({
    step: "images",
    detail: `以 ${modelKey} 產生 ${wanted.length} 張配圖`,
    current: 0,
    total: outline.slides.length,
  });

  const imagesBySlide = {};
  let completed = 0;
  let failed = 0;

  await mapWithConcurrency(wanted, CONCURRENCY, async (slide) => {
    await onProgress?.({
      step: "images",
      slideNumber: slide.slide_number,
      detail: `產生第 ${slide.slide_number} 頁配圖`,
    });

    try {
      const { buffer, contentType } = await renderImage({
        config,
        prompt: buildIllustrationPrompt({
          slide,
          artDirection,
        }),
        aspectRatio: "16:9",
      });
      const suffix = MIME_SUFFIXES[contentType] || "png";
      const name = `slide_${String(slide.slide_number).padStart(2, "0")}.${suffix}`;

      await pptMaster.writeImage({ deckId, name, buffer, contentType });

      /**
       * The sidecar workspace is deleted once the deck is exported, but the
       * preview endpoint still has to inline this image. Keep a copy in Blob
       * Storage; failing to do so only costs the preview its illustration.
       */
      await uploadGeneratedBlob({
        blobName: deckImageBlobName({ jobId, name }),
        buffer,
        contentType,
      }).catch((uploadError) =>
        console.warn("[deck-jobs] Failed to store illustration for preview:", {
          slide: slide.slide_number,
          message: uploadError.message,
        })
      );

      imagesBySlide[slide.slide_number] = [name];
      completed += 1;
      await onProgress?.({
        step: "images",
        status: "succeeded",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁配圖完成`,
        current: completed,
      });
    } catch (imageError) {
      failed += 1;
      completed += 1;
      console.warn("[deck-jobs] Illustration failed, authoring slide without it:", {
        slide: slide.slide_number,
        modelKey,
        code: imageError.code,
      });
      await onProgress?.({
        step: "images",
        status: "failed",
        slideNumber: slide.slide_number,
        detail: `第 ${slide.slide_number} 頁配圖失敗，改以純版面呈現`,
        current: completed,
      });
    }
  });

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

module.exports = {
  buildIllustrationPrompt,
  deckImageBlobName,
  generateDeckImages,
  mapWithConcurrency,
};
