import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { SCRIPT_EXAMPLE, SCRIPT_TEMPLATE_FILES, scriptExampleMarkdown } from "../../../src/lib/videoScriptTemplate.js";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const sharp = require("sharp");
const imageUploads = require("../imageUploads");
const documentUploads = require("../documentUploads");
const uploadStorage = require("../uploadStorage");

imageUploads.createReadyImageUpload = vi.fn();
documentUploads.resolveOwnedDocumentUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();

const { importSceneImages, parseScriptDocx, parseScriptText, readScriptDocument } = require("../scriptDocument");

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

describe("parseScriptText", () => {
  it("splits scenes on # headings and keeps the text before the first heading as the preface", () => {
    expect(parseScriptText("\uFEFF全片設定：清潔員穿藍色制服。\n\n## 場景一：備品 ##\n推車停在門口。\n\n\n\n（5 秒）\n# 洗手\r\n濕洗手。")).toEqual({
      preface: "全片設定：清潔員穿藍色制服。",
      prefaceImageCount: 0,
      scenes: [
        { title: "場景一：備品", text: "推車停在門口。\n\n（5 秒）", images: [] },
        { title: "洗手", text: "濕洗手。", images: [] },
      ],
    });
  });

  it("rejects text without headings, an empty scene and too many scenes", () => {
    expect(() => parseScriptText("場景 1 她推開門。")).toThrow(expect.objectContaining({ status: 422, message: expect.stringMatching(/# 開頭的標題/) }));
    expect(() => parseScriptText("## 開店\n## 吧台\n他微笑。")).toThrow(/開店/);
    expect(() => parseScriptText(Array.from({ length: 31 }, (_, i) => `## ${i}\n動作`).join("\n"))).toThrow(/31 個場景/);
  });
});

describe("published script templates", () => {
  const publicFile = (path) => readFile(join(process.cwd(), "public", path));
  const titles = SCRIPT_EXAMPLE.scenes.map((scene) => scene.title);

  it("imports the example as DOCX and as Markdown with the same scenes", async () => {
    const docx = await parseScriptDocx(await publicFile(SCRIPT_TEMPLATE_FILES.example));
    const markdown = parseScriptText(scriptExampleMarkdown());
    expect(docx.scenes.map((scene) => scene.title)).toEqual(titles);
    expect(markdown.scenes.map((scene) => scene.title)).toEqual(titles);
    expect(docx.preface).toBe(SCRIPT_EXAMPLE.preface);
    expect(markdown.preface).toBe(SCRIPT_EXAMPLE.preface);
    expect(docx.scenes.map((scene) => scene.text)).toEqual(markdown.scenes.map((scene) => scene.text));
  });

  it("imports the blank template as two scenes", async () => {
    const template = await parseScriptDocx(await publicFile(SCRIPT_TEMPLATE_FILES.template));
    expect(template.scenes.map((scene) => scene.title)).toEqual(["場景一：（場景標題）", "場景二：（場景標題）"]);
    expect(template.preface).toMatch(/^影片腳本範本/);
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

    const imported = await importSceneImages({ scenes: parsed.scenes, ...OWNER });

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
  it("splits MD by headings and rejects unsupported or missing documents", async () => {
    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue({ original_file_name: "腳本.md" });
    uploadStorage.downloadUploadBuffer.mockResolvedValue(Buffer.from("## 開店\n她推開門。\n"));
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).resolves.toMatchObject({
      preface: "",
      scenes: [{ title: "開店", text: "她推開門。", images: [] }],
    });

    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue({ original_file_name: "腳本.pdf" });
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).rejects.toMatchObject({ status: 415 });

    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue(null);
    await expect(readScriptDocument({ uploadId: "id", ...OWNER })).rejects.toMatchObject({ status: 404 });
  });
});
