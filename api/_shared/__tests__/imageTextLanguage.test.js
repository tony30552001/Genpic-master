import { describe, expect, it } from "vitest";

import { buildGenerationTextDirective, buildImageTextDirective } from "../imageTextLanguage";

describe("buildImageTextDirective", () => {
  it("keeps in-image text in the selected language", () => {
    const directive = buildImageTextDirective("zh-TW");
    expect(directive).toContain("繁體中文");
    expect(directive).toContain("Traditional Chinese");
    expect(directive).toContain("逐字保留原文");
    expect(directive).toContain("未指定次數時只出現一次");
  });

  it("tells the image model to keep quoted text verbatim", () => {
    const directive = buildGenerationTextDirective("en");
    expect(directive).toContain(
      "Render every quoted string exactly as written, in its original language, and exactly the number of times requested."
    );
    expect(directive).toContain("If no count is specified, render it once.");
    expect(directive).toContain("must be in English.");
  });

  it("still forbids all text for the image model when the user asked for none", () => {
    expect(buildGenerationTextDirective("none")).toContain("Do not include any text");
    expect(buildGenerationTextDirective("kl")).toBe("");
  });

  it("forbids any text when the user asked for none", () => {
    expect(buildImageTextDirective("none")).toContain("不得創造或保留任何圖片文字內容");
  });

  it("returns nothing for a missing or unsupported language", () => {
    expect(buildImageTextDirective(undefined)).toBe("");
    expect(buildImageTextDirective("  ")).toBe("");
    expect(buildImageTextDirective("kl")).toBe("");
  });
});
