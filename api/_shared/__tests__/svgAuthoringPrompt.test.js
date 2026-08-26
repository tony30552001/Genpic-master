import { describe, expect, it } from "vitest";

import { DEFAULT_DESIGN_SYSTEM } from "../deckDesign";
import { DECK_FRAME_IDS, getFrame } from "../deckFrames";
import {
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
  buildOutlineUserMessage,
  buildRepairUserMessage,
  buildSlideUserMessage,
} from "../svgAuthoringPrompt";

const slideOf = (overrides = {}) => ({
  slide_number: 3,
  page_role: "content",
  frame: "compare-2col",
  title: "兩種導入路徑",
  subtitle: "",
  key_points: ["自建模型", "採購 API"],
  image_role: null,
  ...overrides,
});

describe("buildOutlineSystemPrompt", () => {
  const prompt = buildOutlineSystemPrompt({ imageDensity: "key" });

  it("offers the whole vocabulary so the strategist can choose", () => {
    for (const id of DECK_FRAME_IDS) {
      expect(prompt).toContain(id);
    }
  });

  it("withholds geometry, which is not a strategy decision", () => {
    expect(prompt).not.toContain("data-pptx-bounds");
  });

  it("asks for a frame per slide and pushes back on repetition", () => {
    expect(prompt).toContain('"frame":"cover-bleed"');
    expect(prompt).toContain("不要連續兩頁使用同一個骨架");
  });

  it("stops asking the strategist to place the picture", () => {
    expect(prompt).not.toContain('"image_role"');
    expect(prompt).toContain("圖片在版面上的角色由骨架決定");
  });

  /** Art direction now belongs to the design system, so there is one source. */
  it("no longer asks for art direction", () => {
    expect(prompt).not.toContain("art_direction");
  });

  it("asks for data rather than bullets when the material has numbers", () => {
    expect(prompt).toContain('"chart"');
    expect(prompt).toContain("不要把數字寫成條列");
  });
});

describe("buildOutlineSystemPrompt with a recipe", () => {
  it("fixes the narrative spine to the requested page count", () => {
    const prompt = buildOutlineSystemPrompt({
      imageDensity: "key",
      recipeId: "pitch-deck",
      slideCount: 6,
    });

    expect(prompt).toContain("敘事骨幹：投資提案");
    expect(prompt).toContain("6. （ending）");
  });

  it("leaves the prompt free when no recipe applies", () => {
    const prompt = buildOutlineSystemPrompt({
      imageDensity: "key",
      recipeId: "general",
      slideCount: 6,
    });

    expect(prompt).not.toContain("敘事骨幹");
  });
});

describe("buildOutlineUserMessage", () => {
  it("states the deck's task when a brief was given", () => {
    const message = buildOutlineUserMessage({
      material: "素材",
      slideCount: 8,
      brief: { purpose: "爭取預算", audience: "財務主管", outcome: "核准 300 萬" },
    });

    expect(message).toContain("簡報目的：爭取預算");
    expect(message).toContain("聽眾對象：財務主管");
    expect(message).toContain("期望成果：核准 300 萬");
  });

  it("stays exactly as it was when the brief is empty", () => {
    const withoutBrief = buildOutlineUserMessage({ material: "素材", slideCount: 8 });
    const withEmpty = buildOutlineUserMessage({
      material: "素材",
      slideCount: 8,
      brief: { purpose: null, audience: null, outcome: null },
    });

    expect(withEmpty).toBe(withoutBrief);
  });

  it("accepts a partial brief", () => {
    const message = buildOutlineUserMessage({
      material: "素材",
      slideCount: 8,
      brief: { audience: "工程團隊" },
    });

    expect(message).toContain("聽眾對象：工程團隊");
    expect(message).not.toContain("簡報目的");
  });
});

describe("buildSlideUserMessage", () => {
  /**
   * The inversion in one assertion: the main path publishes what the page is,
   * never where its modules sit. Geometry is the author's to decide, and the
   * design system's grid is what keeps pages consistent with one another.
   */
  it("withholds the frame's geometry on the main path", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
    });

    expect(message).toContain("compare-2col");
    expect(message).toContain("版面由你決定");
    for (const module of getFrame("compare-2col").modules) {
      expect(message).not.toContain(`data-pptx-bounds="${module.bounds.join(" ")}"`);
    }
  });

  it("hands over exact geometry once the page has retreated", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
      frameGeometry: true,
    });

    for (const module of getFrame("compare-2col").modules) {
      expect(message).toContain(`data-pptx-bounds="${module.bounds.join(" ")}"`);
    }
  });

  it("never leaks another frame's geometry into the page", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
    });

    const others = DECK_FRAME_IDS.filter((id) => id !== "compare-2col");
    for (const id of others) {
      expect(message, `leaked ${id}`).not.toContain(`（${id}）`);
    }
  });

  it("states the picture's contract without placing it", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf({ frame: "text-image-split", image_role: "hero" }),
      totalSlides: 8,
      availableImages: ["03_slide.png"],
    });

    expect(message).toContain("../images/03_slide.png");
    expect(message).toContain("請安排它的位置與大小");
    expect(message).toContain('preserveAspectRatio="xMidYMid slice"');
  });

  it("forbids an image on a frame that reserved no room for one", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
    });

    expect(message).toContain("請勿使用 <image>");
  });

  it("tells a bleed frame to protect legibility over the picture", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf({ page_role: "cover", frame: "cover-bleed", key_points: [] }),
      totalSlides: 8,
      availableImages: ["01_slide.png"],
    });

    expect(message).toContain("半透明色塊");
    expect(message).toContain('data-pptx-bleed="true"');
  });

  it("restates chart data in the shape the metadata needs", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf({
        frame: "chart-bars",
        chart: {
          type: "column",
          title: "各季營收",
          categories: ["Q1", "Q2"],
          series: [{ name: "雲端", values: [12, 15] }],
        },
      }),
      totalSlides: 8,
      availableImages: [],
    });

    expect(message).toContain("type = column");
    expect(message).toContain("雲端：12、15");
    expect(message).toContain("每根長條的長度＝數值 ÷ 最大值");
  });

  it("restates table data row by row", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf({
        frame: "data-table",
        table: { title: "方案比較", headers: ["方案", "月費"], rows: [["標準", "1200"]] },
      }),
      totalSlides: 8,
      availableImages: [],
    });

    expect(message).toContain("表頭：方案｜月費");
    expect(message).toContain("標準｜1200");
  });

  it("says nothing about data on a page that carries none", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
    });

    expect(message).not.toContain("本頁資料");
  });
});

describe("buildRepairUserMessage", () => {
  const message = buildRepairUserMessage({
    slide: slideOf(),
    previousSvg: "<svg></svg>",
    problems: ["text overflow"],
  });

  /**
   * Load-bearing ordering. An earlier revision led with "shrink the type and
   * cut words", so every layout complaint was resolved by deleting content and
   * decks came back thin. Content must stay the last resort.
   */
  it("puts adjusting geometry ahead of cutting content", () => {
    const geometry = message.indexOf("調整幾何");
    const cut = message.indexOf("才精簡文字");
    expect(geometry).toBeGreaterThan(-1);
    expect(cut).toBeGreaterThan(geometry);
    expect(message).toContain("刪內容是最後手段");
  });

  it("repairs in place rather than sending the page back to a frame", () => {
    expect(message).not.toContain("data-pptx-bounds=\"96 290 512 350\"");
    expect(message).toContain("不要藉修正之便重做整頁");
  });

  it("supplies fixed bounds only on the retreat path", () => {
    const retreat = buildRepairUserMessage({
      slide: slideOf(),
      previousSvg: "<svg></svg>",
      problems: ["text overflow"],
      frameGeometry: true,
    });

    expect(retreat).toContain('data-pptx-bounds="96 290 512 350"');
    expect(retreat).toContain("不要沿用原本的座標");
  });

  it("holds the page role steady", () => {
    expect(message).toContain("必須維持 content");
  });
});

describe("buildAuthoringSystemPrompt", () => {
  it("gives the design system precedence over a template's palette prose", () => {
    const prompt = buildAuthoringSystemPrompt({
      templateSpecs: [{ kind: "style", id: "editorial", spec: "全部滿版" }],
    });

    expect(prompt).toContain("一律以設計系統為準");
  });

  it("injects the deck's design system so every page shares one language", () => {
    const prompt = buildAuthoringSystemPrompt({ designSystem: DEFAULT_DESIGN_SYSTEM });

    expect(prompt).toContain(DEFAULT_DESIGN_SYSTEM.palette.accent);
    expect(prompt).toContain(`頁標題基線固定 y=${DEFAULT_DESIGN_SYSTEM.grid.titleBaseline}`);
  });

  it("authorises the native chart and table markers the contract checks for", () => {
    const prompt = buildAuthoringSystemPrompt({});

    expect(prompt).toContain('data-pptx-replace-with="chart"');
    expect(prompt).toContain('<metadata type="application/json">');
    expect(prompt).toContain("完整畫出來");
  });

  it("leaves the per-page geometry out of the shared system prompt", () => {
    const prompt = buildAuthoringSystemPrompt({});
    expect(prompt).not.toContain("本頁版面骨架");
  });
});
