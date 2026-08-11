import { describe, expect, it } from "vitest";

import {
  DOCUMENT_ACCEPT,
  inferDocumentMimeType,
  isSupportedDocumentFile,
} from "../documentFormats";

describe("documentFormats", () => {
  it("accepts the AnyDoc Office and structured-data formats", () => {
    expect(isSupportedDocumentFile({ name: "report.docx" })).toBe(true);
    expect(isSupportedDocumentFile({ name: "deck.pptm" })).toBe(true);
    expect(isSupportedDocumentFile({ name: "metrics.xlsb" })).toBe(true);
    expect(isSupportedDocumentFile({ name: "book.epub" })).toBe(true);
    expect(isSupportedDocumentFile({ name: "archive.zip" })).toBe(false);
  });

  it("infers a stable MIME type when the browser reports none", () => {
    expect(
      inferDocumentMimeType({ name: "metrics.xlsx", type: "" })
    ).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(
      inferDocumentMimeType({
        name: "slides.pptx",
        type: "application/octet-stream",
      })
    ).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });

  it("builds the file-input accept list from the shared extension map", () => {
    expect(DOCUMENT_ACCEPT).toContain(".docx");
    expect(DOCUMENT_ACCEPT).toContain(".xlsx");
    expect(DOCUMENT_ACCEPT).toContain(".epub");
  });
});
