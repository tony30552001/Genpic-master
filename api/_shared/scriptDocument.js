const JSZip = require("jszip");
const sharp = require("sharp");
const { XMLParser } = require("fast-xml-parser");
const { getExtension } = require("./documentParser");
const { createReadyImageUpload } = require("./imageUploads");
const { downloadUploadBuffer } = require("./uploadStorage");
const { resolveOwnedDocumentUpload } = require("./documentUploads");
const { VideoModelError } = require("./videoModelFamilies");
const { MAX_SCRIPT_SOURCE, MAX_SHOT_REFERENCES, MAX_SHOTS } = require("./videoStoryboard");

const MAX_DOCUMENT_IMAGES = 40;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_BOLD_TITLE = 30;
const REFERENCE_SIZE = 2048;
const PREVIEW_SIZE = 160;
const VECTOR_EXTENSIONS = new Set(["emf", "wmf"]);
const HEADING_STYLE = /^(heading [1-9]|title)$/i;
const HEADING_STYLE_ID = /^(Heading[1-9]|Title)$/i;
const OFF_VALUES = new Set(["0", "false", "off"]);
const TEXT_EXTENSIONS = new Set(["txt", "md"]);

const invalid = (message) => new VideoModelError(message, "script_document_invalid", 422);

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
});

const tagOf = (node) => Object.keys(node).find((key) => key !== ":@");
const attrsOf = (node) => node[":@"] || {};
const childrenOf = (node) => {
  const children = node[tagOf(node)];
  return Array.isArray(children) ? children : [];
};
const findChild = (node, tag) => childrenOf(node).find((child) => tagOf(child) === tag);

const nodeText = (node) =>
  childrenOf(node)
    .map((child) => (tagOf(child) === "#text" ? String(child["#text"]) : nodeText(child)))
    .join("");

const readZipText = async (zip, name) => {
  const file = zip.file(name);
  return file ? file.async("string") : null;
};

/** Word style ids are localized ("1" in Chinese Word); names stay "heading 1". */
const readHeadingStyles = async (zip) => {
  const text = await readZipText(zip, "word/styles.xml");
  const headings = new Set();
  if (!text) return headings;
  const styles = xml.parse(text).flatMap((node) => (tagOf(node) === "w:styles" ? childrenOf(node) : []));
  for (const style of styles) {
    if (tagOf(style) !== "w:style") continue;
    const name = findChild(style, "w:name");
    if (name && HEADING_STYLE.test(attrsOf(name)["w:val"] || "")) headings.add(attrsOf(style)["w:styleId"]);
  }
  return headings;
};

const readImageTargets = async (zip) => {
  const text = await readZipText(zip, "word/_rels/document.xml.rels");
  const targets = new Map();
  if (!text) return targets;
  for (const root of xml.parse(text)) {
    for (const relation of childrenOf(root)) {
      const attrs = attrsOf(relation);
      if (tagOf(relation) !== "Relationship" || !String(attrs.Type || "").endsWith("/image")) continue;
      const target = String(attrs.Target || "");
      targets.set(attrs.Id, {
        external: attrs.TargetMode === "External",
        path: target.startsWith("/") ? target.slice(1) : `word/${target.replace(/^\.\//, "")}`,
      });
    }
  }
  return targets;
};

const collectImageIds = (node, ids) => {
  for (const child of childrenOf(node)) {
    const tag = tagOf(child);
    if (tag === "mc:Fallback") continue;
    if (tag === "a:blip" && attrsOf(child)["r:embed"]) ids.push(attrsOf(child)["r:embed"]);
    if (tag === "v:imagedata" && attrsOf(child)["r:id"]) ids.push(attrsOf(child)["r:id"]);
    collectImageIds(child, ids);
  }
};

const isOn = (node) => !OFF_VALUES.has(String(attrsOf(node)["w:val"] ?? "true").toLowerCase());

const readRun = (run, paragraph) => {
  let bold = false;
  let text = "";
  for (const child of childrenOf(run)) {
    const tag = tagOf(child);
    if (tag === "w:rPr") {
      const b = findChild(child, "w:b");
      bold = Boolean(b && isOn(b));
    } else if (tag === "w:t") text += nodeText(child);
    else if (tag === "w:tab") text += "\t";
    else if (tag === "w:br" || tag === "w:cr") text += "\n";
    else if (tag === "w:drawing" || tag === "w:pict" || tag === "mc:AlternateContent") {
      collectImageIds(child, paragraph.imageIds);
    }
  }
  if (text) paragraph.runs.push({ text, bold });
};

const readParagraph = (node) => {
  const paragraph = { styleId: null, runs: [], imageIds: [] };
  const visit = (nodes) => {
    for (const child of nodes) {
      const tag = tagOf(child);
      if (tag === "w:pPr") {
        const style = findChild(child, "w:pStyle");
        paragraph.styleId = style ? attrsOf(style)["w:val"] : null;
      } else if (tag === "w:r") readRun(child, paragraph);
      else if (tag !== "w:del" && tag !== "w:moveFrom" && tag !== "#text") visit(childrenOf(child));
    }
  };
  visit(childrenOf(node));
  return { ...paragraph, text: paragraph.runs.map((run) => run.text).join("") };
};

const collectParagraphs = (nodes, paragraphs) => {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (tag === "w:p") paragraphs.push(readParagraph(node));
    else if (tag !== "#text" && tag !== "w:sectPr") collectParagraphs(childrenOf(node), paragraphs);
  }
  return paragraphs;
};

const isHeading = (paragraph, headingStyles) => {
  const title = paragraph.text.trim();
  if (!title) return false;
  if (paragraph.styleId && (headingStyles.has(paragraph.styleId) || HEADING_STYLE_ID.test(paragraph.styleId))) {
    return true;
  }
  const textRuns = paragraph.runs.filter((run) => run.text.trim());
  return title.length <= MAX_BOLD_TITLE && textRuns.every((run) => run.bold);
};

const assertZipSize = (zip) => {
  const total = Object.values(zip.files).reduce(
    // JSZip has no public accessor for the declared size of a loaded entry.
    (sum, file) => sum + (file._data?.uncompressedSize || 0),
    0
  );
  if (total > MAX_UNCOMPRESSED_BYTES) throw invalid("DOCX 解壓後超過 200MB，請縮小內嵌圖片後再匯入");
};

const loadZip = async (buffer) => {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw invalid("無法讀取 DOCX 檔案，請確認檔案沒有損毀或加密");
  }
};

/**
 * Splits a DOCX script into scenes. A scene starts at a Heading-styled
 * paragraph, or a paragraph that is all bold and at most 30 characters; its
 * text and inline images run until the next heading. Text before the first
 * heading is the preface.
 */
const parseScriptDocx = async (buffer) => {
  const zip = await loadZip(buffer);
  assertZipSize(zip);
  const documentXml = await readZipText(zip, "word/document.xml");
  if (!documentXml) throw invalid("DOCX 缺少文件內容（word/document.xml）");
  const [headingStyles, imageTargets] = await Promise.all([readHeadingStyles(zip), readImageTargets(zip)]);
  const paragraphs = collectParagraphs(xml.parse(documentXml), []);

  const preface = { lines: [], imageIds: [] };
  const scenes = [];
  for (const paragraph of paragraphs) {
    if (isHeading(paragraph, headingStyles)) {
      scenes.push({ title: paragraph.text.trim(), lines: [], imageIds: [...paragraph.imageIds] });
      continue;
    }
    const target = scenes.at(-1) || preface;
    target.lines.push(paragraph.text);
    target.imageIds.push(...paragraph.imageIds);
  }
  if (!scenes.length) {
    throw invalid("文件中找不到場景標題。請用 Word 的「標題」樣式，或整段粗體且不超過 30 字的段落標示每個場景");
  }
  if (scenes.length > MAX_SHOTS) throw invalid(`文件有 ${scenes.length} 個場景，最多 ${MAX_SHOTS} 個`);

  // Labels follow first appearance across the document (Image1, Image2…), so
  // a script's @ImageN and a character's imageLabel name the same picture.
  const labels = new Map();
  const joinLines = (lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const result = scenes.map((scene) => {
    const text = joinLines(scene.lines);
    if (!text) throw invalid(`場景「${scene.title}」沒有文字內容`);
    const images = [...new Map(
      scene.imageIds
        .map((id) => imageTargets.get(id))
        .filter(Boolean)
        .map((image) => [image.path, image])
    ).values()].map((image) => {
      if (!labels.has(image.path)) labels.set(image.path, `Image${labels.size + 1}`);
      return { ...image, label: labels.get(image.path) };
    });
    if (images.length > MAX_SHOT_REFERENCES) {
      throw invalid(`場景「${scene.title}」有 ${images.length} 張圖片，每個場景最多 ${MAX_SHOT_REFERENCES} 張`);
    }
    return { title: scene.title, text, images };
  });
  if (labels.size > MAX_DOCUMENT_IMAGES) {
    throw invalid(`文件內嵌 ${labels.size} 張圖片，最多 ${MAX_DOCUMENT_IMAGES} 張`);
  }
  const totalLength = result.reduce((sum, scene) => sum + scene.text.length, 0);
  if (totalLength > MAX_SCRIPT_SOURCE) {
    throw invalid(`文件文字共 ${totalLength} 字，超過 ${MAX_SCRIPT_SOURCE} 字上限`);
  }
  return {
    zip,
    preface: joinLines(preface.lines),
    prefaceImageCount: new Set(preface.imageIds).size,
    scenes: result,
  };
};

const encodeImage = async (buffer) => {
  const image = sharp(buffer, { limitInputPixels: 100_000_000 }).rotate();
  const [jpeg, preview] = await Promise.all([
    image
      .clone()
      .resize({ width: REFERENCE_SIZE, height: REFERENCE_SIZE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 90 })
      .toBuffer(),
    image
      .clone()
      .resize({ width: PREVIEW_SIZE, height: PREVIEW_SIZE, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 70 })
      .toBuffer(),
  ]);
  return { jpeg, preview: `data:image/webp;base64,${preview.toString("base64")}` };
};

/**
 * Stores each distinct scene image as an image upload owned by the user and
 * returns every scene's references. Images that cannot be converted are
 * reported in `skipped` and their labels stay unused.
 */
const importSceneImages = async ({ zip, scenes, tenantId, userId }) => {
  const uploads = new Map();
  const previews = {};
  const skipped = [];
  for (const scene of scenes) {
    for (const image of scene.images) {
      if (uploads.has(image.path) || skipped.some((item) => item.path === image.path)) continue;
      const { label } = image;
      const extension = getExtension(image.path);
      const file = image.external ? null : zip.file(image.path);
      if (!file || VECTOR_EXTENSIONS.has(extension)) {
        skipped.push({ path: image.path, label, reason: image.external ? "外部連結" : extension.toUpperCase() || "未知格式" });
        continue;
      }
      let encoded;
      try {
        encoded = await encodeImage(await file.async("nodebuffer"));
      } catch {
        skipped.push({ path: image.path, label, reason: "無法辨識的圖片" });
        continue;
      }
      const uploadId = await createReadyImageUpload({
        tenantId,
        userId,
        buffer: encoded.jpeg,
        contentType: "image/jpeg",
        fileName: `${label}.jpg`,
      });
      uploads.set(image.path, uploadId);
      previews[uploadId] = encoded.preview;
    }
  }
  const references = scenes.map((scene) =>
    scene.images
      .filter((image) => uploads.has(image.path))
      .map((image) => ({ label: image.label, uploadId: uploads.get(image.path) }))
  );
  return { references, previews, skipped: skipped.map(({ label, reason }) => ({ label, reason })) };
};

/**
 * Reads an uploaded script document. TXT and MD return their text, which is
 * split like a pasted script; DOCX returns its parsed scenes, whose images
 * are stored later with importSceneImages.
 */
const readScriptDocument = async ({ uploadId, tenantId, userId }) => {
  const upload = await resolveOwnedDocumentUpload({ uploadId, tenantId, userId });
  if (!upload) throw new VideoModelError("找不到腳本文件，請重新上傳", "upload_not_found", 404);
  const extension = getExtension(upload.original_file_name);
  if (!TEXT_EXTENSIONS.has(extension) && extension !== "docx") {
    throw new VideoModelError("腳本文件只支援 DOCX、TXT、MD", "script_document_unsupported", 415);
  }
  const buffer = await downloadUploadBuffer(upload);
  if (TEXT_EXTENSIONS.has(extension)) {
    const script = buffer.toString("utf8").replace(/^\uFEFF/, "").trim();
    if (!script) throw invalid("腳本文件沒有文字內容");
    if (script.length > MAX_SCRIPT_SOURCE) {
      throw invalid(`腳本文件共 ${script.length} 字，超過 ${MAX_SCRIPT_SOURCE} 字上限`);
    }
    return { kind: "text", script };
  }
  return { kind: "scenes", ...(await parseScriptDocx(buffer)) };
};

module.exports = {
  MAX_DOCUMENT_IMAGES,
  importSceneImages,
  parseScriptDocx,
  readScriptDocument,
};
