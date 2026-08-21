import { describe, expect, it } from "vitest";

import { buildImageTextDirective } from "../imageTextLanguage";

describe("buildImageTextDirective", () => {
  it("keeps in-image text in the selected language", () => {
    const directive = buildImageTextDirective("zh-TW");
    expect(directive).toContain("繁體中文");
    expect(directive).toContain("Traditional Chinese");
    expect(directive).toContain("不得翻譯成英文");
  });

  it("forbids any text when the user asked for none", () => {
    expect(buildImageTextDirective("none")).toContain("不得出現任何文字");
  });

  it("returns nothing for a missing or unsupported language", () => {
    expect(buildImageTextDirective(undefined)).toBe("");
    expect(buildImageTextDirective("  ")).toBe("");
    expect(buildImageTextDirective("kl")).toBe("");
  });
});
