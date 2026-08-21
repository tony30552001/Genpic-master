import { describe, expect, it } from "vitest";

import {
  DEFAULT_IMAGE_PURPOSE,
  buildImagePrompt,
  buildTransformPrompt,
  normalizeImagePurpose,
} from "../imagePrompt";

describe("normalizeImagePurpose", () => {
  it("accepts the supported purposes", () => {
    expect(normalizeImagePurpose("infographic")).toBe("infographic");
    expect(normalizeImagePurpose("STORYBOARD")).toBe("storyboard");
    expect(normalizeImagePurpose(" freeform ")).toBe("freeform");
  });

  it("falls back to the default for anything else", () => {
    expect(normalizeImagePurpose("poster")).toBe(DEFAULT_IMAGE_PURPOSE);
    expect(normalizeImagePurpose(undefined)).toBe(DEFAULT_IMAGE_PURPOSE);
  });
});

describe("buildImagePrompt", () => {
  it("keeps the style prose and the palette cues in separate clauses", () => {
    const prompt = buildImagePrompt({
      userScript: "A calm harbour at dawn",
      stylePrompt: "Soft watercolour washes with visible paper grain",
      styleTags: ["柔和", "暖色", "柔和"],
      purpose: "infographic",
    });

    expect(prompt).toContain(
      "Render the whole image in this style: Soft watercolour washes with visible paper grain."
    );
    expect(prompt).toContain("Apply these additional style cues: 柔和, 暖色.");
    expect(prompt).toContain("A calm harbour at dawn.");
    expect(prompt).toContain("infographic or presentation slide");
  });

  it("composes storyboard scenes as cinematic panels, not slides", () => {
    const prompt = buildImagePrompt({
      userScript: "A courier runs through neon rain",
      purpose: "storyboard",
    });

    expect(prompt).toContain("cinematic storyboard panel");
    expect(prompt).not.toContain("infographic");
  });

  it("adds no composition directive for freeform images", () => {
    const prompt = buildImagePrompt({
      userScript: "An orange tabby asleep on a windowsill",
      purpose: "freeform",
    });

    expect(prompt).toBe("An orange tabby asleep on a windowsill.");
  });

  it("appends the image text language directive", () => {
    const prompt = buildImagePrompt({
      userScript: "A quarterly revenue chart",
      imageLanguage: "zh-TW",
    });

    expect(prompt).toContain("繁體中文");
    expect(
      buildImagePrompt({ userScript: "A quarterly revenue chart", imageLanguage: "none" })
    ).toContain("Do NOT include any text");
  });

  it("rejects an empty content description", () => {
    expect(() => buildImagePrompt({ userScript: "   " })).toThrow("缺少 userScript");
  });
});

describe("buildTransformPrompt", () => {
  it("states each mode guarantee directly without a role-play preamble", () => {
    const styleTransfer = buildTransformPrompt({
      mode: "style_transfer",
      prompt: "ukiyo-e woodblock",
    });
    expect(styleTransfer).toMatch(/^Redraw this image/);
    expect(styleTransfer).toContain("ukiyo-e woodblock");

    expect(buildTransformPrompt({ mode: "bg_replace", prompt: "a snowy street" })).toContain(
      "Replace only the background"
    );
    expect(buildTransformPrompt({ mode: "element_extract" })).toContain(
      "Take the main foreground subjects"
    );
  });

  it("falls back to the reference mode for an unknown mode", () => {
    expect(buildTransformPrompt({ mode: "unknown" })).toContain("visual reference");
  });

  it("shares the image text language directive with generation", () => {
    expect(
      buildTransformPrompt({ mode: "style_transfer", prompt: "oil painting", imageLanguage: "ja" })
    ).toContain("日本語");
  });
});
