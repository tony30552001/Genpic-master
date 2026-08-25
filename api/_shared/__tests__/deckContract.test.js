import { describe, expect, it } from "vitest";

import {
  DECK_IMAGE_ROLES,
  DECK_MAX_SLIDES,
  DECK_MIN_SLIDES,
  applyImagePolicy,
  inspectSlideSvg,
  normalizeImageDensity,
  normalizeOutline,
  normalizeSlideCount,
  slideFileName,
} from "../deckContract";

const validSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="cover">
  <g id="title-block" data-pptx-bounds="120 260 1040 140">
    <text x="120" y="330" font-family="Noto Sans TC" font-size="56" fill="#111827">生成式 AI 導入策略</text>
  </g>
  <g id="subtitle-block" data-pptx-bounds="120 420 1040 60">
    <text x="120" y="460" font-family="Noto Sans TC" font-size="24" fill="#6b7280">2025 年度規劃</text>
  </g>
</svg>`;

describe("normalizeSlideCount", () => {
  it("clamps to the supported range and defaults sanely", () => {
    expect(normalizeSlideCount(1)).toBe(DECK_MIN_SLIDES);
    expect(normalizeSlideCount(99)).toBe(DECK_MAX_SLIDES);
    expect(normalizeSlideCount("7")).toBe(7);
    expect(normalizeSlideCount(undefined)).toBe(8);
  });
});

describe("slideFileName", () => {
  it("zero-pads so slides sort in presentation order", () => {
    expect(slideFileName(0)).toBe("01_slide.svg");
    expect(slideFileName(9)).toBe("10_slide.svg");
  });
});

describe("normalizeOutline", () => {
  it("assigns page roles, numbers slides and honours the slide budget", () => {
    const outline = normalizeOutline(
      {
        title: "  AI 策略  ",
        slides: [
          { title: "封面" },
          { title: "現況", keyPoints: ["a", "b", "c", "d", "e", "f"] },
          { title: "結語" },
          { title: "多出來的一頁" },
        ],
      },
      { slideCount: 3 }
    );

    expect(outline.title).toBe("AI 策略");
    expect(outline.slides).toHaveLength(3);
    expect(outline.slides.map((slide) => slide.page_role)).toEqual([
      "cover",
      "content",
      "ending",
    ]);
    expect(outline.slides[1].slide_number).toBe(2);
    expect(outline.slides[1].key_points).toHaveLength(5);
  });

  it("falls back to a usable outline for malformed model output", () => {
    const outline = normalizeOutline({ slides: [null] });
    expect(outline.title).toBe("未命名簡報");
    expect(outline.slides[0].title).toBe("投影片 1");
    expect(outline.slides[0].page_role).toBe("cover");
  });
});

describe("inspectSlideSvg", () => {
  it("accepts a slide that satisfies the error-level contract", () => {
    expect(inspectSlideSvg(validSvg)).toEqual([]);
  });

  it("rejects a missing or unknown page role", () => {
    const withoutRole = validSvg.replace(' data-pptx-page-role="cover"', "");
    expect(inspectSlideSvg(withoutRole)).toContain("根 <svg> 缺少 data-pptx-page-role");

    const badRole = validSvg.replace('data-pptx-page-role="cover"', 'data-pptx-page-role="intro"');
    expect(inspectSlideSvg(badRole).join()).toContain("data-pptx-page-role 必須是");
  });

  it("rejects the wrong canvas, a root transform and Markdown fences", () => {
    expect(inspectSlideSvg(validSvg.replace("0 0 1280 720", "0 0 1920 1080")).join()).toContain(
      'viewBox="0 0 1280 720"'
    );
    expect(
      inspectSlideSvg(validSvg.replace("<svg ", '<svg transform="scale(0.5)" ')).join()
    ).toContain("根 <svg> 禁止使用 transform");
    expect(inspectSlideSvg("```svg\n<svg></svg>```").join()).toContain("SVG 必須以 <svg 開頭");
  });

  it("rejects forbidden constructs and HTML named entities", () => {
    const withStyle = validSvg.replace("<g id=", '<style>.a{fill:red}</style><g id=');
    expect(inspectSlideSvg(withStyle)).toContain("禁止 <style> 元素");

    const withEntity = validSvg.replace("2025 年度規劃", "2025 &mdash; 年度規劃");
    expect(inspectSlideSvg(withEntity).join()).toContain("&mdash;");
  });

  it("requires unique ids and valid bounds on every root module", () => {
    const withoutBounds = validSvg.replace(' data-pptx-bounds="120 260 1040 140"', "");
    expect(inspectSlideSvg(withoutBounds).join()).toContain("缺少 data-pptx-bounds");

    const duplicateId = validSvg.replace('id="subtitle-block"', 'id="title-block"');
    expect(inspectSlideSvg(duplicateId)).toContain("<g> 的 id 重複：title-block");

    const overflowing = validSvg.replace('"120 260 1040 140"', '"120 260 1400 140"');
    expect(inspectSlideSvg(overflowing).join()).toContain("必須落在 1280x720 畫布內");

    const negativeSize = validSvg.replace('"120 260 1040 140"', '"120 260 0 140"');
    expect(inspectSlideSvg(negativeSize).join()).toContain("寬高必須為正值");
  });

  it("ignores nested groups, which the gate does not require bounds for", () => {
    const nested = validSvg.replace(
      '<text x="120" y="330"',
      '<g><text x="120" y="330"'
    ).replace("</text>\n  </g>", "</text></g>\n  </g>");
    expect(inspectSlideSvg(nested)).toEqual([]);
  });
});

describe("normalizeImageDensity", () => {
  it("falls back to the key density for unknown values", () => {
    expect(normalizeImageDensity("EVERY")).toBe("every");
    expect(normalizeImageDensity("none")).toBe("none");
    expect(normalizeImageDensity("lots")).toBe("key");
    expect(normalizeImageDensity(undefined)).toBe("key");
  });
});

describe("applyImagePolicy", () => {
  const outlineOf = (slides) =>
    normalizeOutline({ title: "AI 策略", slides }, { slideCount: slides.length });

  const nineSlides = [
    { title: "封面", page_role: "cover" },
    { title: "議程", page_role: "toc" },
    { title: "現況", page_role: "content" },
    { title: "章節一", page_role: "section" },
    { title: "作法", page_role: "content", needs_image: true, image_prompt: "a team at work" },
    { title: "數據", page_role: "content" },
    { title: "風險", page_role: "content" },
    { title: "時程", page_role: "content" },
    { title: "結語", page_role: "ending" },
  ];

  it("illustrates nothing when the density is none", () => {
    const { outline, density } = applyImagePolicy({
      outline: outlineOf(nineSlides),
      density: "none",
    });

    expect(density).toBe("none");
    expect(outline.slides.every((slide) => slide.needs_image === false)).toBe(true);
    expect(outline.slides.every((slide) => slide.image_prompt === "")).toBe(true);
  });

  it("picks about a third of the deck by role priority and never the ending", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf(nineSlides),
      density: "key",
    });

    const illustrated = outline.slides.filter((slide) => slide.needs_image);
    expect(illustrated.map((slide) => slide.slide_number)).toEqual([1, 4, 5]);
    expect(outline.slides[8].needs_image).toBe(false);
  });

  it("illustrates every page including the ending at the every density", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf(nineSlides),
      density: "every",
    });

    expect(outline.slides.filter((slide) => slide.needs_image)).toHaveLength(9);
    expect(outline.slides.every((slide) => slide.image_prompt.length > 0)).toBe(true);
  });

  it("synthesizes a brief instead of silently dropping a selected page", () => {
    const { outline, synthesizedPrompts } = applyImagePolicy({
      outline: outlineOf(nineSlides),
      density: "key",
    });

    expect(synthesizedPrompts).toEqual([1, 4]);
    expect(outline.slides[0].image_prompt).toContain("AI 策略");
    expect(outline.slides[0].image_prompt).toContain("封面");
    expect(outline.slides[4].image_prompt).toBe("a team at work");
  });

  it("lets the frame decide what the illustration does on the page", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf(nineSlides),
      density: "every",
    });

    for (const slide of outline.slides) {
      if (!slide.needs_image) continue;
      expect(slide.image_role, `slide ${slide.slide_number}`).toBeTruthy();
      expect(DECK_IMAGE_ROLES).toContain(slide.image_role);
    }

    expect(outline.slides[0].frame).toBe("cover-bleed");
    expect(outline.slides[0].image_role).toBe("background");
  });

  it("moves a page to its illustrated sibling when the policy adds a picture", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf([
        { title: "封面", page_role: "cover", frame: "cover-centered" },
        { title: "論點", page_role: "content", frame: "content-bullets" },
        { title: "結語", page_role: "ending", frame: "ending-statement" },
      ]),
      density: "every",
    });

    expect(outline.slides[0].frame).toBe("cover-bleed");
    expect(outline.slides[1].frame).toBe("text-image-split");
    expect(outline.slides[2].frame).toBe("ending-bleed");
    expect(outline.slides.every((slide) => slide.needs_image)).toBe(true);
  });

  it("drops the frame's image module when the policy takes the picture away", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf([
        { title: "封面", page_role: "cover", frame: "cover-bleed" },
        { title: "論點", page_role: "content", frame: "text-image-split" },
        { title: "結語", page_role: "ending", frame: "ending-bleed" },
      ]),
      density: "none",
    });

    expect(outline.slides[0].frame).toBe("cover-centered");
    expect(outline.slides[1].frame).toBe("content-bullets");
    expect(outline.slides[2].frame).toBe("ending-statement");
    expect(outline.slides.every((slide) => slide.needs_image === false)).toBe(true);
  });

  it("keeps a structural frame and gives up the picture instead", () => {
    const { outline, synthesizedPrompts } = applyImagePolicy({
      outline: outlineOf([
        { title: "封面", page_role: "cover", frame: "cover-centered" },
        { title: "四象限", page_role: "content", frame: "matrix-2x2" },
        { title: "結語", page_role: "ending", frame: "ending-statement" },
      ]),
      density: "every",
    });

    expect(outline.slides[1].frame).toBe("matrix-2x2");
    expect(outline.slides[1].needs_image).toBe(false);
    expect(outline.slides[1].image_prompt).toBe("");
    expect(synthesizedPrompts).not.toContain(2);
  });

  it("never asks for fewer than two pictures in a short deck", () => {
    const { outline } = applyImagePolicy({
      outline: outlineOf([
        { title: "封面", page_role: "cover" },
        { title: "重點", page_role: "content" },
        { title: "結語", page_role: "ending" },
      ]),
      density: "key",
    });

    expect(outline.slides.filter((slide) => slide.needs_image)).toHaveLength(2);
  });
});
