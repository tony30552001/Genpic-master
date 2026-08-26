import { describe, expect, it } from "vitest";

import {
  BROWSER_FONT_STACK,
  PREVIEW_KIND_DIRECTORIES,
  buildManifestSource,
  previewFileName,
  previewPublicPath,
  substitutePreviewFonts,
} from "../previewAssets";

describe("substitutePreviewFonts", () => {
  it("replaces every server font stack with the browser stack", () => {
    const svg =
      '<svg><text font-family="\'Noto Sans CJK TC\', \'Noto Sans\', sans-serif">甲</text>' +
      '<text font-family="\'Noto Sans CJK TC\', sans-serif">乙</text></svg>';

    const result = substitutePreviewFonts(svg);

    expect(result).not.toContain("Noto Sans CJK TC");
    expect(result.match(/font-family="/g)).toHaveLength(2);
    expect(result).toContain(`font-family="${BROWSER_FONT_STACK}"`);
  });

  it("leaves everything other than font-family untouched", () => {
    const svg = '<svg><rect fill="#101828" data-pptx-bounds="0,0,1280,720"/></svg>';
    expect(substitutePreviewFonts(svg)).toBe(svg);
  });

  it("tolerates empty input", () => {
    expect(substitutePreviewFonts(null)).toBe("");
  });
});

describe("preview paths", () => {
  it("names files by template id and page number", () => {
    expect(previewFileName("consulting-decision", 2)).toBe("consulting-decision-2.svg");
  });

  it("maps each kind onto its public directory", () => {
    expect(previewPublicPath("style", "consulting-decision", 1)).toBe(
      "/template-previews/styles/consulting-decision-1.svg"
    );
    expect(previewPublicPath("layout", "presentation_core", 2)).toBe(
      "/template-previews/layouts/presentation_core-2.svg"
    );
  });

  it("knows exactly two kinds", () => {
    expect(PREVIEW_KIND_DIRECTORIES).toEqual({ style: "styles", layout: "layouts" });
  });
});

describe("buildManifestSource", () => {
  it("emits a parseable module with sorted template ids", () => {
    const source = buildManifestSource({
      styles: {
        "zebra-style": ["/template-previews/styles/zebra-style-1.svg"],
        "alpha-style": ["/template-previews/styles/alpha-style-1.svg"],
      },
      layouts: {},
    });

    expect(source.indexOf("alpha-style")).toBeLessThan(source.indexOf("zebra-style"));
    expect(source).toContain("export const TEMPLATE_PREVIEWS");
    expect(source).toContain("請勿手動編輯");
  });

  it("survives a run that produced nothing", () => {
    const source = buildManifestSource({});
    expect(source).toContain("styles: {");
    expect(source).toContain("layouts: {");
  });
});
