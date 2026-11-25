import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const sharp = require("sharp");
const imageUploads = require("../imageUploads");
const documentUploads = require("../documentUploads");
const uploadStorage = require("../uploadStorage");

imageUploads.createReadyImageUpload = vi.fn();
documentUploads.resolveOwnedDocumentUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();

const { importSceneImages, parseScriptDocx, readScriptDocument } = require("../scriptDocument");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';

const run = (text, { bold = false } = {}) =>
  `<w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const image = (relId) => `<w:r><w:drawing><a:graphic><a:blip r:embed="${relId}"/></a:graphic></w:drawing></w:r>`;
const paragraph = (content, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${content}</w:p>`;

const buildDocx = async ({ body, media = {} }) => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0"?><w:document ${NS}><w:body>${body}<w:sectPr/></w:body></w:document>`);
  zip.file(
    "word/styles.xml",
    `<w:styles ${NS}><w:style w:styleId="1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="a"><w:name w:val="Normal"/></w:style></w:styles>`
  );
  const relations = Object.keys(media)
    .map((name, index) => `<Relationship Id="rId${index + 1}" Type="http://x/image" Target="media/${name}"/>`)
    .join("");
  zip.file("word/_rels/document.xml.rels", `<Relationships>${relations}</Relationships>`);
  for (const [name, data] of Object.entries(media)) zip.file(`word/media/${name}`, data);
  return zip.generateAsync({ type: "nodebuffer" });
};

const png = () =>
  sharp({ create: { width: 64, height: 48, channels: 3, background: "#3366ff" } }).png().toBuffer();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseScriptDocx", () => {
  it("splits scenes on localized heading styles and short bold paragraphs", async () => {
    const buffer = await buildDocx({
      body: [
        paragraph(run("一支咖啡廣告。") + image("rId3")),
        paragraph(run("開店"), "1"),
        paragraph(run("她推開門，") + "<w:r><w:tab/></w:r>" + run("微笑。") + image("rId1")),
        `<w:tbl><w:tr><w:tc>${paragraph(run("招牌寫「早安」。"))}</w:tc></w:tr></w:tbl>`,
        paragraph(`<w:del><w:r><w:delText>刪掉的字</w:delText></w:r></w:del>${run("")}`),
        paragraph(run("場景二", { bold: true })),
        paragraph(run("他端出咖啡。") + image("rId2") + image("rId1")),
      ].join(""),
      media: { "a.png": "x", "b.png": "y", "c.png": "z" },
    });
    const parsed = await parseScriptDocx(buffer);
    expect(parsed.preface).toBe("一支咖啡廣告。");
    expect(parsed.prefaceImageCount).toBe(1);
    expect(parsed.scenes.map(({ title, text }) => ({ title, text }))).toEqual([
      { title: "開店", text: "她推開門，\t微笑。\n招牌寫「早安」。" },
      { title: "場景二", text: "他端出咖啡。" },
    ]);
    expect(parsed.scenes.map((scene) => scene.images.map((item) => item.label))).toEqual([
      ["Image1"],
      ["Image2", "Image1"],
    ]);
  });

  it("explains the accepted heading formats when the document has none", async () => {
    const buffer = await buildDocx({ body: paragraph(run("沒有標題的一段很長很長的腳本文字，超過三十個字所以不算粗體標題喔喔喔喔")) });
    await expect(parseScriptDocx(buffer)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/標題/) });
  });

  it("rejects a scene without text and a file that is not a DOCX", async () => {
    const empty = await buildDocx({ body: paragraph(run("開店"), "1") + paragraph(run("結尾"), "1") });
    await expect(parseScriptDocx(empty)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/開店/) });
    await expect(parseScriptDocx(Buffer.from("not a zip"))).rejects.toMatchObject({ status: 422 });
  });
});

describe("importSceneImages", () => {
  it("stores each distinct image once and skips vector images", async () => {
    const buffer = await buildDocx({
      body: [
        paragraph(run("開店"), "1"),
        paragraph(run("她推門。") + image("rId1") + image("rId2")),
        paragraph(run("吧台"), "1"),
        paragraph(run("他微笑。") + image("rId1")),
      ].join(""),
      media: { "photo.png": await png(), "logo.emf": "emf" },
    });
    const parsed = await parseScriptDocx(buffer);
    imageUploads.createReadyImageUpload.mockResolvedValue("123e4567-e89b-42d3-a456-426614174000");

    const imported = await importSceneImages({ zip: parsed.zip, scenes: parsed.scenes, ...OWNER });

    expect(imageUploads.createReadyImageUpload).toHaveBeenCalledTimes(1);
    expect(imageUploads.createReadyImageUpload).toHaveBeenCalledWith(
      expect.objectContaining({ ...OWNER, contentType: "image/jpeg", fileName: "Image1.jpg" })
    );
    const reference = { label: "Image1", uploadId: "123e4567-e89b-42d3-a456-426614174000" };
    expect(imported.references).toEqual([[reference], [reference]]);
    expect(imported.skipped).toEqual([{ label: "Image2", reason: "EMF" }]);
    expect(imported.previews[reference.uploadId]).toMatch(/^data:image\/webp;base64,/);
  });
});

describe("readScriptDocument", () => {
  it("reads TXT as script text and rejects unsupported or missing documents", async () => {
    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue({ original_file_name: "腳本.txt" });
    uploadStorage.downloadUploadBuffer.mockResolvedValue(Buffer.from("\uFEFF場景 1 她推開門。\n"));
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).resolves.toEqual({
      kind: "text",
      script: "場景 1 她推開門。",
    });

    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue({ original_file_name: "腳本.pdf" });
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).rejects.toMatchObject({ status: 415 });

    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue(null);
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).rejects.toMatchObject({ status: 404 });
  });
});
