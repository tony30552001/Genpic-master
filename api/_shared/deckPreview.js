/**
 * Slide previews are rendered by the browser inside `<img>`, which is a sandbox:
 * no scripts, and no external resource loading. Authored slides reference their
 * illustration as `../images/<name>` (relative to the sidecar workspace), so the
 * only way a preview can show its illustration is to inline the bytes.
 */

const IMAGE_HREF = /(<image\b[^>]*?\s(?:xlink:href|href)\s*=\s*")([^"]*)(")/gi;
const WORKSPACE_IMAGE = /^(?:\.\.\/)?images\/([A-Za-z0-9._-]+)$/;

const imageNameFromHref = (href) => {
  const match = WORKSPACE_IMAGE.exec(String(href || "").trim());
  return match ? match[1] : null;
};

/** Every distinct workspace image the slide references, in first-seen order. */
const listSlideImageNames = (svg) => {
  const names = new Set();
  for (const match of String(svg || "").matchAll(IMAGE_HREF)) {
    const name = imageNameFromHref(match[2]);
    if (name) names.add(name);
  }
  return [...names];
};

/**
 * Replace workspace image references with data URLs.
 *
 * `resolveImage(name)` returns `{ buffer, contentType }` or a falsy value. An
 * image that cannot be resolved keeps its original reference: the preview shows
 * an empty area instead of failing, which matches how a deck whose illustration
 * failed is still authored and exported.
 */
const inlineSlideImages = async (svg, resolveImage) => {
  const source = String(svg || "");
  const names = listSlideImageNames(source);
  if (names.length === 0) return source;

  const dataUrls = new Map();
  for (const name of names) {
    let image = null;
    try {
      image = await resolveImage(name);
    } catch (error) {
      console.warn("[deck-preview] Failed to inline slide image:", {
        name,
        message: error.message,
      });
    }
    if (!image?.buffer) continue;
    const contentType = image.contentType || "image/png";
    dataUrls.set(name, `data:${contentType};base64,${image.buffer.toString("base64")}`);
  }
  if (dataUrls.size === 0) return source;

  return source.replace(IMAGE_HREF, (match, prefix, href, suffix) => {
    const name = imageNameFromHref(href);
    const dataUrl = name ? dataUrls.get(name) : null;
    return dataUrl ? `${prefix}${dataUrl}${suffix}` : match;
  });
};

module.exports = { inlineSlideImages, listSlideImageNames };
