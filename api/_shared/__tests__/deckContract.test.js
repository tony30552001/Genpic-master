import { describe, expect, it } from "vitest";

import {
  DECK_IMAGE_ROLES,
  DECK_MAX_SLIDES,
  DECK_MIN_SLIDES,
  applyImagePolicy,
  inspectSlideSvg,
  normalizeImageDensity,
  normalizeOutline,
  normalizeSlideChart,
  normalizeSlideCount,
  normalizeSlideTable,
  slideFileName,
} from "../deckContract";
import { buildRecipePlan } from "../deckRecipes";

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

/**
 * These rules replace what frames used to prevent by construction. They are
 * deliberately mechanical: they catch structural mistakes without expressing an
 * opinion about the design.
 */
describe("inspectSlideSvg free-form guardrails", () => {
  const page = (body) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="content">${body}</svg>`;
  const textGroup = (id, bounds, extra = "") =>
    `<g id="${id}" data-pptx-bounds="${bounds}"${extra}><text x="120" y="200" font-size="20" fill="#111111">內容</text></g>`;

  it("rejects a module that leaves the safe area", () => {
    expect(inspectSlideSvg(page(textGroup("stray", "0 0 400 200"))).join()).toContain(
      "超出安全邊界"
    );
  });

  it("exempts a module that declares itself full-bleed", () => {
    expect(
      inspectSlideSvg(page(textGroup("hero", "0 0 1280 300", ' data-pptx-bleed="true"')))
    ).toEqual([]);
  });

  it("rejects modules too small to hold anything legible", () => {
    expect(inspectSlideSvg(page(textGroup("chip", "120 120 20 10"))).join()).toContain(
      "尺寸過小"
    );
  });

  it("rejects text stacked on text", () => {
    const body = textGroup("first", "120 120 400 200") + textGroup("second", "130 130 400 200");
    expect(inspectSlideSvg(page(body)).join()).toContain("重疊過多");
  });

  /**
   * The counter-example that keeps the overlap rule usable: text sitting on a
   * decorative panel is legitimate design and must survive.
   */
  it("allows text laid over a decorative panel", () => {
    const panel =
      '<g id="panel" data-pptx-bounds="120 120 500 300"><rect x="120" y="120" width="500" height="300" fill="#EEEEEE"/></g>';
    expect(inspectSlideSvg(page(panel + textGroup("caption", "150 150 400 200")))).toEqual([]);
  });

  it("allows text modules that merely touch without meaningful overlap", () => {
    const body = textGroup("left", "120 120 400 200") + textGroup("right", "500 120 400 200");
    expect(inspectSlideSvg(page(body))).toEqual([]);
  });
});

describe("inspectSlideSvg native replacement markers", () => {
  const chartGroup = (metadata, drawing = '<rect x="150" y="150" width="80" height="200" fill="#2F6FEB"/>') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="content"><g id="revenue-chart" data-pptx-replace-with="chart" data-pptx-bounds="120 120 600 400">${metadata}${drawing}</g></svg>`;
  const payload = (type) =>
    `<metadata type="application/json">{"name":"revenue-chart","type":"${type}","categories":["Q1","Q2"],"series":[{"name":"雲端","values":[12,15]}]}</metadata>`;

  it("accepts a marker carrying metadata and a visible fallback", () => {
    expect(inspectSlideSvg(chartGroup(payload("column")))).toEqual([]);
  });

  it("requires the JSON metadata child", () => {
    expect(inspectSlideSvg(chartGroup("")).join()).toContain("<metadata type=\"application/json\">");
  });

  it("rejects unparseable metadata", () => {
    expect(
      inspectSlideSvg(chartGroup('<metadata type="application/json">{oops}</metadata>')).join()
    ).toContain("不是合法 JSON");
  });

  it("rejects a chart type the exporter does not support", () => {
    expect(inspectSlideSvg(chartGroup(payload("donut"))).join()).toContain("metadata type 必須是");
  });

  /** Upstream requires the visible fallback regardless of native eligibility. */
  it("rejects a marker with no visible drawing", () => {
    expect(inspectSlideSvg(chartGroup(payload("column"), "")).join()).toContain(
      "必須畫出完整可見的圖形"
    );
  });
});

describe("normalizeSlideChart", () => {
  it("keeps upstream chart type spelling and drops unknown types", () => {
    expect(
      normalizeSlideChart({
        type: "doughnut",
        categories: ["A", "B"],
        series: [{ name: "占比", values: [1, 2] }],
      })
    ).toMatchObject({ type: "doughnut", categories: ["A", "B"] });
    expect(
      normalizeSlideChart({ type: "donut", categories: ["A"], series: [{ values: [1] }] })
    ).toBeNull();
  });

  it("drops series whose length does not match the categories", () => {
    expect(
      normalizeSlideChart({
        type: "column",
        categories: ["A", "B"],
        series: [{ name: "短", values: [1] }],
      })
    ).toBeNull();
  });

  it("keeps a single ring for pie and doughnut", () => {
    const chart = normalizeSlideChart({
      type: "pie",
      categories: ["A", "B"],
      series: [
        { name: "一", values: [1, 2] },
        { name: "二", values: [3, 4] },
      ],
    });
    expect(chart.series).toHaveLength(1);
  });
});

describe("normalizeSlideTable", () => {
  it("pads short rows and drops a table with no rows", () => {
    const table = normalizeSlideTable({
      headers: ["項目", "金額"],
      rows: [["授權", "120"], ["服務"]],
    });
    expect(table.rows).toEqual([
      ["授權", "120"],
      ["服務", ""],
    ]);
    expect(normalizeSlideTable({ headers: ["項目"], rows: [] })).toBeNull();
  });
});

describe("normalizeOutline with a recipe spine", () => {
  const outlineOf = (roles) => ({
    title: "投資提案",
    summary: "",
    slides: roles.map((role, index) => ({
      page_role: role,
      title: `第 ${index + 1} 頁`,
      key_points: ["重點"],
      frame: "content-bullets",
    })),
  });

  it("corrects a role the model drifted on", () => {
    const spine = buildRecipePlan("pitch-deck", 4);
    const outline = normalizeOutline(outlineOf(["cover", "content", "content", "content"]), {
      slideCount: 4,
      spine,
    });

    expect(outline.slides.map((slide) => slide.page_role)).toEqual(
      spine.map((section) => section.role)
    );
    expect(outline.slides[3].page_role).toBe("ending");
  });

  /** The recipe owns the shape of the argument, never the material. */
  it("leaves titles and points untouched", () => {
    const outline = normalizeOutline(outlineOf(["cover", "content", "content", "content"]), {
      slideCount: 4,
      spine: buildRecipePlan("pitch-deck", 4),
    });

    expect(outline.slides[3].title).toBe("第 4 頁");
    expect(outline.slides[3].key_points).toEqual(["重點"]);
  });

  it("re-resolves a frame the corrected role no longer supports", () => {
    const outline = normalizeOutline(outlineOf(["cover", "content", "content", "content"]), {
      slideCount: 4,
      spine: buildRecipePlan("pitch-deck", 4),
    });

    expect(outline.slides[3].frame).toBe("ending-statement");
  });

  it("ignores a spine that does not match the page count", () => {
    const outline = normalizeOutline(outlineOf(["cover", "content", "ending"]), {
      slideCount: 3,
      spine: buildRecipePlan("pitch-deck", 8),
    });

    expect(outline.slides.map((slide) => slide.page_role)).toEqual([
      "cover",
      "content",
      "ending",
    ]);
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
