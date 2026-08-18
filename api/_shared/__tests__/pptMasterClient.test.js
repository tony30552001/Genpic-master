import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { sidecarFileName } = require("../pptMasterClient");

describe("sidecarFileName", () => {
  it("keeps names the sidecar already accepts", () => {
    expect(sidecarFileName("quarterly-review_2026.pptx")).toBe(
      "quarterly-review_2026.pptx"
    );
  });

  it("replaces the non-Latin characters that the sidecar rejects", () => {
    expect(sidecarFileName("8TYSP安全衛生改善成果分享說明2026-SMT版.pptx")).toBe(
      "8TYSP_2026-SMT_.pptx"
    );
  });

  it("falls back to a stem when nothing survives sanitising", () => {
    expect(sidecarFileName("職場霸凌.pdf")).toBe("source.pdf");
  });

  it("keeps a usable name when the upload has no extension", () => {
    expect(sidecarFileName("報告")).toBe("source");
    expect(sidecarFileName("")).toBe("source");
  });

  it("normalises the extension the sidecar dispatches on", () => {
    expect(sidecarFileName("report.PDF")).toBe("report.pdf");
  });
});
