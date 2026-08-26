import { describe, expect, it } from "vitest";

import {
  blobNameVariants,
  classifyUploadBlobs,
  isManagedBlobName,
  sumBytes,
} from "../legacyUploadBlobs";

const blob = (name, contentLength = 0) => ({ name, contentLength });

describe("isManagedBlobName", () => {
  it("recognises the prefixes owned by the upload lifecycle", () => {
    expect(isManagedBlobName("ready/4ce2b0b6-0b6a-4a1f-9c3d-1f2e3d4c5b6a")).toBe(true);
    expect(isManagedBlobName("staging/4ce2b0b6-0b6a-4a1f-9c3d-1f2e3d4c5b6a")).toBe(true);
  });

  it("treats flat legacy names as unmanaged", () => {
    expect(isManagedBlobName("SMT-AI _Tony.pptx")).toBe(false);
    expect(isManagedBlobName("content-1787387271014-minimalist-sop-guide.png")).toBe(false);
  });
});

describe("blobNameVariants", () => {
  it("offers the raw and URL-encoded forms of a name", () => {
    expect(blobNameVariants("20250305_傳送系統介紹.pdf")).toEqual([
      "20250305_傳送系統介紹.pdf",
      "20250305_%E5%82%B3%E9%80%81%E7%B3%BB%E7%B5%B1%E4%BB%8B%E7%B4%B9.pdf",
    ]);
  });

  it("keeps a single entry when encoding changes nothing", () => {
    expect(blobNameVariants("outline.txt")).toEqual(["outline.txt"]);
  });
});

describe("classifyUploadBlobs", () => {
  it("keeps managed blobs even when nothing references them", () => {
    const result = classifyUploadBlobs([blob("ready/abc", 10)], [], "uploads");

    expect(result.managed).toEqual([{ name: "ready/abc", bytes: 10 }]);
    expect(result.orphaned).toEqual([]);
  });

  it("keeps a legacy blob referenced by a URL-encoded stored URL", () => {
    const result = classifyUploadBlobs(
      [blob("20250305_傳送系統介紹.pdf", 1024)],
      [
        "https://acct.blob.core.windows.net/uploads/20250305_%E5%82%B3%E9%80%81%E7%B3%BB%E7%B5%B1%E4%BB%8B%E7%B4%B9.pdf",
      ],
      "uploads"
    );

    expect(result.referenced).toEqual([{ name: "20250305_傳送系統介紹.pdf", bytes: 1024 }]);
    expect(result.orphaned).toEqual([]);
  });

  it("keeps a legacy blob referenced by its raw name", () => {
    const result = classifyUploadBlobs(
      [blob("SMT-AI _Tony.pptx", 5)],
      ["https://acct.blob.core.windows.net/uploads/SMT-AI _Tony.pptx"],
      "uploads"
    );

    expect(result.orphaned).toEqual([]);
    expect(result.referenced).toHaveLength(1);
  });

  it("keeps a blob referenced anywhere inside a larger stored value", () => {
    const result = classifyUploadBlobs(
      [blob("outline.txt", 5)],
      ['{"documents":["https://acct.blob.core.windows.net/uploads/outline.txt?sig=secret"]}'],
      "uploads"
    );

    expect(result.orphaned).toEqual([]);
  });

  it("marks unreferenced legacy blobs as removable", () => {
    const result = classifyUploadBlobs(
      [blob("LineWorks_-_20260127.pptx", 2048), blob("ready/kept", 1)],
      ["https://acct.blob.core.windows.net/uploads/something-else.pdf"],
      "uploads"
    );

    expect(result.orphaned).toEqual([
      { name: "LineWorks_-_20260127.pptx", bytes: 2048 },
    ]);
    expect(result.managed).toHaveLength(1);
  });

  it("does not let a shorter name match a longer unrelated blob", () => {
    const result = classifyUploadBlobs(
      [blob("report.pdf", 1), blob("annual-report.pdf", 2)],
      ["https://acct.blob.core.windows.net/uploads/annual-report.pdf"],
      "uploads"
    );

    expect(result.orphaned).toEqual([{ name: "report.pdf", bytes: 1 }]);
  });

  it("treats a missing content length as zero bytes", () => {
    const result = classifyUploadBlobs([{ name: "legacy.pdf" }], [], "uploads");

    expect(result.orphaned).toEqual([{ name: "legacy.pdf", bytes: 0 }]);
  });
});

describe("sumBytes", () => {
  it("totals the byte counts of a classification bucket", () => {
    expect(sumBytes([{ bytes: 3 }, { bytes: 4 }])).toBe(7);
  });
});
