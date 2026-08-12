import { describe, expect, it } from "vitest";

import {
  DECK_MAX_SLIDES,
  DECK_MIN_SLIDES,
  inspectSlideSvg,
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
