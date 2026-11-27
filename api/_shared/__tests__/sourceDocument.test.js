import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const documentUploads = require("../documentUploads");
const uploadStorage = require("../uploadStorage");

documentUploads.resolveOwnedDocumentUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();

const { readSourceDocument } = require("../sourceDocument");

const OWNER = { uploadId: "id", tenantId: "tenant-1", userId: "user-1" };
const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
const run = (text) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;
const image = (relId) => `<w:r><w:drawing><a:graphic><a:blip r:embed="${relId}"/></a:graphic></w:drawing></w:r>`;
const paragraph = (content, style) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${content}</w:p>`;

const buildDocx = async (body, media) => {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document ${NS}><w:body>${body}</w:body></w:document>`);
  zip.file("word/styles.xml", `<w:styles ${NS}><w:style w:styleId="1"><w:name w:val="heading 1"/></w:style></w:styles>`);
  zip.file(
    "word/_rels/document.xml.rels",
    `<Relationships>${Object.keys(media)
      .map((name, index) => `<Relationship Id="rId${index + 1}" Type="http://x/image" Target="media/${name}"/>`)
      .join("")}</Relationships>`
  );
  for (const [name, data] of Object.entries(media)) zip.file(`word/media/${name}`, data);
  return zip.generateAsync({ type: "nodebuffer" });
};

// A one-page PDF with optional Helvetica text and raw RGB images.
const buildPdf = ({ text = "", images = [] }) => {
  const draw = images.map((item, index) => `q ${item.size} 0 0 ${item.size} 72 ${100 + index * 200} cm /Im${index} Do Q`);
  const content = [text ? `BT /F1 24 Tf 72 700 Td (${text}) Tj ET` : "", ...draw].join("\n");
  const xObjects = images.map((_, index) => `/Im${index} ${6 + index} 0 R`).join(" ");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> /XObject << ${xObjects} >> >> /Contents 5 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)]),
    ...images.map(({ size }) => {
      const pixels = Buffer.alloc(size * size * 3, 0x80);
      return Buffer.concat([
        Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${size} /Height ${size} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length ${pixels.length} >>\nstream\n`),
        pixels,
        Buffer.from("\nendstream"),
      ]);
    }),
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [];
  let length = parts[0].length;
  objects.forEach((body, index) => {
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(body), Buffer.from("\nendobj\n")]);
    offsets.push(length);
    parts.push(chunk);
    length += chunk.length;
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`;
  return Buffer.concat([...parts, Buffer.from(xref)]);
};

const upload = (fileName, buffer) => {
  documentUploads.resolveOwnedDocumentUpload.mockResolvedValue({ original_file_name: fileName });
  uploadStorage.downloadUploadBuffer.mockResolvedValue(buffer);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readSourceDocument", () => {
  it("marks DOCX headings and labels each readable image once where it first appears", async () => {
    upload(
      "SOP.docx",
      await buildDocx(
        [
          paragraph(run("洗手"), "1"),
          paragraph(run("濕潤雙手。") + image("rId1") + image("rId2")),
          paragraph(run("搓揉二十秒。") + image("rId1")),
        ].join(""),
        { "a.png": "png", "logo.emf": "emf" }
      )
    );
    const source = await readSourceDocument(OWNER);
    expect(source.text).toBe("## 洗手\n濕潤雙手。 [Image1]\n搓揉二十秒。 [Image1]");
    expect(source.images.map(({ label }) => label)).toEqual(["Image1"]);
    await expect(source.images[0].read()).resolves.toEqual(Buffer.from("png"));
    expect(source).toMatchObject({ omittedImages: 0, unsupportedImages: 1 });
  });

  it("labels PDF images large enough to be references after their page's text", async () => {
    upload("SOP.pdf", buildPdf({ text: "Wash hands", images: [{ size: 120 }, { size: 20 }] }));
    const source = await readSourceDocument(OWNER);
    expect(source.text).toBe("Wash hands\n[Image1]");
    expect(source.images).toHaveLength(1);
    expect((await source.images[0].read()).subarray(1, 4).toString()).toBe("PNG");
  });

  it("rejects a PDF without text, an unsupported type and a missing upload", async () => {
    upload("scan.pdf", buildPdf({ images: [{ size: 120 }] }));
    await expect(readSourceDocument(OWNER)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/掃描檔/) });

    upload("deck.pptx", Buffer.from("x"));
    await expect(readSourceDocument(OWNER)).rejects.toMatchObject({ status: 415 });

    documentUploads.resolveOwnedDocumentUpload.mockResolvedValue(null);
    await expect(readSourceDocument(OWNER)).rejects.toMatchObject({ status: 404 });
  });

  it("reads Markdown as plain text and rejects text over the source limit", async () => {
    upload("SOP.md", Buffer.from("\uFEFF# 洗手\n濕潤雙手。\n"));
    await expect(readSourceDocument(OWNER)).resolves.toEqual({
      text: "# 洗手\n濕潤雙手。",
      images: [],
      omittedImages: 0,
      unsupportedImages: 0,
    });

    upload("SOP.txt", Buffer.from("字".repeat(50_001)));
    await expect(readSourceDocument(OWNER)).rejects.toMatchObject({ status: 422 });
  });
});
