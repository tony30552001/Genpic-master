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
const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)\s*#*\s*$/;
const NO_HEADINGS =
  "文件中找不到場景標題。Word 請用「標題」樣式或整段粗體且不超過 30 字的段落，Markdown 與 TXT 請用 # 開頭的標題標示每個場景";

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

const joinLines = (lines) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

const assertSceneCount = (count) => {
  if (!count) throw invalid(NO_HEADINGS);
  if (count > MAX_SHOTS) throw invalid(`文件有 ${count} 個場景，最多 ${MAX_SHOTS} 個`);
};

const sceneText = (scene) => {
  const text = joinLines(scene.lines);
  if (!text) throw invalid(`場景「${scene.title}」沒有文字內容`);
  return text;
};

const assertTotalLength = (scenes) => {
  const totalLength = scenes.reduce((sum, scene) => sum + scene.text.length, 0);
  if (totalLength > MAX_SCRIPT_SOURCE) {
    throw invalid(`文件文字共 ${totalLength} 字，超過 ${MAX_SCRIPT_SOURCE} 字上限`);
  }
};

const loadZip = async (buffer) => {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    throw invalid("無法讀取 DOCX 檔案，請確認檔案沒有損毀或加密");
  }
};

/**
 * An embedded DOCX picture as an importable image: `key` identifies it across
 * the document, `read` loads its bytes, or is null with a `reason` when the
 * picture is linked or vector art that cannot become a reference image.
 */
const docxImage = (zip, target) => {
  const extension = getExtension(target.path);
  const file = target.external ? null : zip.file(target.path);
  const usable = file && !VECTOR_EXTENSIONS.has(extension);
  return {
    key: target.path,
    read: usable ? () => file.async("nodebuffer") : null,
    reason: usable ? null : target.external ? "外部連結" : extension.toUpperCase() || "未知格式",
  };
};

/**
 * Reads a DOCX's paragraphs in order, including those in tables. A heading is
 * a Heading-styled paragraph, or one that is all bold and at most 30
 * characters; `images` are the paragraph's embedded pictures.
 */
const readDocxParagraphs = async (buffer) => {
  const zip = await loadZip(buffer);
  assertZipSize(zip);
  const documentXml = await readZipText(zip, "word/document.xml");
  if (!documentXml) throw invalid("DOCX 缺少文件內容（word/document.xml）");
  const [headingStyles, imageTargets] = await Promise.all([readHeadingStyles(zip), readImageTargets(zip)]);
  return collectParagraphs(xml.parse(documentXml), []).map((paragraph) => ({
    text: paragraph.text,
    heading: isHeading(paragraph, headingStyles),
    images: paragraph.imageIds
      .map((id) => imageTargets.get(id))
      .filter(Boolean)
      .map((target) => docxImage(zip, target)),
  }));
};

/**
 * Splits a DOCX script into scenes. A scene starts at a heading; its text and
 * inline images run until the next heading. Text before the first heading is
 * the preface.
 */
const parseScriptDocx = async (buffer) => {
  const paragraphs = await readDocxParagraphs(buffer);

  const preface = { lines: [], images: [] };
  const scenes = [];
  for (const paragraph of paragraphs) {
    if (paragraph.heading) {
      scenes.push({ title: paragraph.text.trim(), lines: [], images: [...paragraph.images] });
      continue;
    }
    const target = scenes.at(-1) || preface;
    target.lines.push(paragraph.text);
    target.images.push(...paragraph.images);
  }
  assertSceneCount(scenes.length);

  // Labels follow first appearance across the document (Image1, Image2…), so
  // a script's @ImageN and a character's imageLabel name the same picture.
  const labels = new Map();
  const result = scenes.map((scene) => {
    const text = sceneText(scene);
    const images = [...new Map(scene.images.map((image) => [image.key, image])).values()].map((image) => {
      if (!labels.has(image.key)) labels.set(image.key, `Image${labels.size + 1}`);
      return { ...image, label: labels.get(image.key) };
    });
    if (images.length > MAX_SHOT_REFERENCES) {
      throw invalid(`場景「${scene.title}」有 ${images.length} 張圖片，每個場景最多 ${MAX_SHOT_REFERENCES} 張`);
    }
    return { title: scene.title, text, images };
  });
  if (labels.size > MAX_DOCUMENT_IMAGES) {
    throw invalid(`文件內嵌 ${labels.size} 張圖片，最多 ${MAX_DOCUMENT_IMAGES} 張`);
  }
  assertTotalLength(result);
  return {
    preface: joinLines(preface.lines),
    prefaceImageCount: new Set(preface.images.map((image) => image.key)).size,
    scenes: result,
  };
};

/**
 * Splits a Markdown or plain-text script into scenes. A scene starts at a
 * line beginning with one to six "#"; text before the first heading is the
 * preface. Text scripts carry no images.
 */
const parseScriptText = (text) => {
  const preface = [];
  const scenes = [];
  for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const heading = line.match(MARKDOWN_HEADING);
    if (heading) scenes.push({ title: heading[1], lines: [] });
    else (scenes.at(-1)?.lines || preface).push(line);
  }
  assertSceneCount(scenes.length);
  const result = scenes.map((scene) => ({ title: scene.title, text: sceneText(scene), images: [] }));
  assertTotalLength(result);
  return { preface: joinLines(preface), prefaceImageCount: 0, scenes: result };
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
 * Stores each distinct scene image (`{ key, label, read, reason }`) as an
 * image upload owned by the user and returns every scene's references.
 * Images that cannot be read or converted are reported in `skipped` and their
 * labels stay unused.
 */
const importSceneImages = async ({ scenes, tenantId, userId }) => {
  const uploads = new Map();
  const previews = {};
  const skipped = [];
  for (const scene of scenes) {
    for (const image of scene.images) {
      if (uploads.has(image.key) || skipped.some((item) => item.key === image.key)) continue;
      const { label } = image;
      if (!image.read) {
        skipped.push({ key: image.key, label, reason: image.reason });
        continue;
      }
      let encoded;
      try {
        encoded = await encodeImage(await image.read());
      } catch {
        skipped.push({ key: image.key, label, reason: "無法辨識的圖片" });
        continue;
      }
      const uploadId = await createReadyImageUpload({
        tenantId,
        userId,
        buffer: encoded.jpeg,
        contentType: "image/jpeg",
        fileName: `${label}.jpg`,
      });
      uploads.set(image.key, uploadId);
      previews[uploadId] = encoded.preview;
    }
  }
  const references = scenes.map((scene) =>
    scene.images
      .filter((image) => uploads.has(image.key))
      .map((image) => ({ label: image.label, uploadId: uploads.get(image.key) }))
  );
  return { references, previews, skipped: skipped.map(({ label, reason }) => ({ label, reason })) };
};

/**
 * Reads an uploaded script document into scenes: DOCX through
 * parseScriptDocx, TXT and MD through parseScriptText. Scene images are
 * stored later with importSceneImages.
 */
const readScriptDocument = async ({ uploadId, tenantId, userId }) => {
  const upload = await resolveOwnedDocumentUpload({ uploadId, tenantId, userId });
  if (!upload) throw new VideoModelError("找不到腳本文件，請重新上傳", "upload_not_found", 404);
  const extension = getExtension(upload.original_file_name);
  if (!TEXT_EXTENSIONS.has(extension) && extension !== "docx") {
    throw new VideoModelError("腳本文件只支援 DOCX、TXT、MD", "script_document_unsupported", 415);
  }
  const buffer = await downloadUploadBuffer(upload);
  if (TEXT_EXTENSIONS.has(extension)) return parseScriptText(buffer.toString("utf8"));
  return parseScriptDocx(buffer);
};

module.exports = {
  MAX_DOCUMENT_IMAGES,
  importSceneImages,
  invalid,
  parseScriptDocx,
  parseScriptText,
  readDocxParagraphs,
  readScriptDocument,
};
