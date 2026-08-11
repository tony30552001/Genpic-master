import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  inferMimeType,
  isSupportedDocument,
  mapAnyDocError,
  parseDocumentBuffer,
} = require("../documentParser");

describe("documentParser", () => {
  it("infers MIME types for AnyDoc formats", () => {
    expect(inferMimeType("report.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(inferMimeType("slides.pptm")).toBe(
      "application/vnd.ms-powerpoint.presentation.macroEnabled.12"
    );
    expect(inferMimeType("book.epub")).toBe("application/epub+zip");
  });

  it("recognizes supported files by extension or MIME type", () => {
    expect(isSupportedDocument("", "report.docx")).toBe(true);
    expect(isSupportedDocument("text/csv", "upload")).toBe(true);
    expect(isSupportedDocument("application/zip", "archive.zip")).toBe(false);
  });

  it("parses plain text without passing it through AnyDoc", async () => {
    const result = await parseDocumentBuffer({
      buffer: Buffer.from("\uFEFF# 標題\n內容", "utf8"),
      fileName: "outline.md",
      mimeType: "text/markdown",
    });

    expect(result.kind).toBe("text");
    expect(result.parser).toBe("plain_text");
    expect(result.text).toBe("# 標題\n內容");
  });

  it("converts CSV to Markdown with AnyDoc", async () => {
    const result = await parseDocumentBuffer({
      buffer: Buffer.from("name,value\nAlpha,10\nBeta,20\n", "utf8"),
      fileName: "metrics.csv",
      mimeType: "text/csv",
    });

    expect(result.kind).toBe("text");
    expect(result.parser).toBe("anydoc");
    expect(result.format).toBe("csv");
    expect(result.text).toMatch(/Alpha/);
    expect(result.text).toMatch(/20/);
  });

  it("keeps image files on the GPT vision route", async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const result = await parseDocumentBuffer({
      buffer,
      fileName: "reference.png",
      mimeType: "image/png",
    });

    expect(result.kind).toBe("vision");
    expect(result.parser).toBe("gpt_vision");
    expect(result.buffer).toBe(buffer);
  });

  it("maps AnyDoc resource-limit errors to an actionable API error", () => {
    const error = mapAnyDocError({
      code: "resourceLimit",
      message: "node count exceeded",
    });

    expect(error.code).toBe("document_resource_limit");
    expect(error.status).toBe(413);
    expect(error.message).toMatch(/安全限制/);
  });
});
