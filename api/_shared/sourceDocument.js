const { getExtension } = require("./documentParser");
const { downloadUploadBuffer } = require("./uploadStorage");
const { resolveOwnedDocumentUpload } = require("./documentUploads");
const { VideoModelError } = require("./videoModelFamilies");
const { MAX_SCRIPT_SOURCE } = require("./videoStoryboard");
const { MAX_DOCUMENT_IMAGES, invalid, readDocxParagraphs } = require("./scriptDocument");

/**
 * Reads a source document (an SOP, manual or article) for the storyboard
 * agent to adapt. Every importable picture gets a label (Image1, Image2…) in
 * order of first appearance and an [ImageN] marker where it appears in the
 * text, so the agent can pick the pictures that fit each shot.
 */

const SOURCE_EXTENSIONS = new Set(["docx", "txt", "md", "pdf"]);
// Smaller PDF images are bullets, icons and rules, not useful references.
const MIN_PDF_IMAGE_SIDE = 100;
// PDF fonts often map common characters to Kangxi radicals (⼿ for 手).
const CJK_RADICALS = /[\u2E80-\u2EFF\u2F00-\u2FDF]/g;

const createLabeler = () => {
  const images = [];
  const keys = new Map();
  let omitted = 0;
  let unsupported = 0;
  return {
    // Returns the marker for an image, or "" when it cannot be offered.
    mark(image) {
      if (keys.has(image.key)) return keys.get(image.key);
      let marker = "";
      if (!image.read) unsupported += 1;
      else if (images.length >= MAX_DOCUMENT_IMAGES) omitted += 1;
      else {
        const label = `Image${images.length + 1}`;
        images.push({ key: image.key, label, read: image.read });
        marker = `[${label}]`;
      }
      keys.set(image.key, marker);
      return marker;
    },
    result: (text) => ({ text, images, omittedImages: omitted, unsupportedImages: unsupported }),
  };
};

const readDocxSource = async (buffer) => {
  const labeler = createLabeler();
  const lines = (await readDocxParagraphs(buffer)).map((paragraph) => {
    const text = paragraph.text.trim();
    const markers = paragraph.images.map((image) => labeler.mark(image)).filter(Boolean);
    return [paragraph.heading && text ? `## ${text}` : text, ...markers].filter(Boolean).join(" ");
  });
  return labeler.result(lines.filter(Boolean).join("\n"));
};

const readPdfSource = async (buffer) => {
  const { extractImages, extractText, getDocumentProxy } = await import("unpdf");
  let pdf;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
  } catch {
    throw invalid("無法讀取 PDF，請確認檔案沒有損毀或加密");
  }
  const { text: pages } = await extractText(pdf, { mergePages: false });
  if (!pages.some((page) => page.trim())) {
    throw invalid("PDF 沒有可讀取的文字（可能是掃描檔），請改用含文字的 PDF 或 DOCX");
  }
  const labeler = createLabeler();
  const blocks = [];
  for (const [index, pageText] of pages.entries()) {
    const images = await extractImages(pdf, index + 1, { format: "png" });
    const markers = images
      .filter((image) => image.width >= MIN_PDF_IMAGE_SIDE && image.height >= MIN_PDF_IMAGE_SIDE)
      .map((image, order) => {
        const data = Buffer.from(image.data);
        return labeler.mark({ key: image.key ?? `p${index + 1}-${order}`, read: async () => data });
      })
      .filter(Boolean);
    blocks.push([pageText.replace(CJK_RADICALS, (char) => char.normalize("NFKC")).trim(), markers.join(" ")].filter(Boolean).join("\n"));
  }
  return labeler.result(blocks.filter(Boolean).join("\n\n"));
};

/**
 * Returns `{ text, images: [{ key, label, read }], omittedImages,
 * unsupportedImages }` for an owned DOCX, TXT, MD or PDF upload.
 */
const readSourceDocument = async ({ uploadId, tenantId, userId }) => {
  const upload = await resolveOwnedDocumentUpload({ uploadId, tenantId, userId });
  if (!upload) throw new VideoModelError("找不到文件，請重新上傳", "upload_not_found", 404);
  const extension = getExtension(upload.original_file_name);
  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new VideoModelError("文件只支援 DOCX、TXT、MD、PDF", "script_document_unsupported", 415);
  }
  const buffer = await downloadUploadBuffer(upload);
  const source =
    extension === "docx"
      ? await readDocxSource(buffer)
      : extension === "pdf"
        ? await readPdfSource(buffer)
        : createLabeler().result(buffer.toString("utf8").replace(/^\uFEFF/, "").trim());
  if (!source.text) throw invalid("文件沒有可讀取的文字");
  if (source.text.length > MAX_SCRIPT_SOURCE) {
    throw invalid(`文件文字超過 ${MAX_SCRIPT_SOURCE.toLocaleString("en-US")} 字，請精簡後再上傳`);
  }
  return source;
};

module.exports = { readSourceDocument };
