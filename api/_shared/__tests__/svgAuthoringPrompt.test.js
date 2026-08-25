import { describe, expect, it } from "vitest";

import { DECK_FRAME_IDS, getFrame } from "../deckFrames";
import {
  buildAuthoringSystemPrompt,
  buildOutlineSystemPrompt,
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
});

describe("buildSlideUserMessage", () => {
  it("carries the exact geometry of the chosen frame", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf(),
      totalSlides: 8,
      availableImages: [],
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

  it("points the picture at the frame's image module", () => {
    const message = buildSlideUserMessage({
      deckTitle: "AI 策略",
      slide: slideOf({ frame: "text-image-split", image_role: "hero" }),
      totalSlides: 8,
      availableImages: ["03_slide.png"],
    });

    expect(message).toContain("../images/03_slide.png");
    expect(message).toContain("圖片放進 visual 這一格");
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
  });
});

describe("buildRepairUserMessage", () => {
  const message = buildRepairUserMessage({
    slide: slideOf(),
    previousSvg: "<svg></svg>",
    problems: ["text overflow"],
  });

  it("restates the frame so the fix has a target to return to", () => {
    expect(message).toContain("compare-2col");
    expect(message).toContain('data-pptx-bounds="96 290 512 350"');
  });

  it("puts returning to the frame ahead of cutting content", () => {
    const restore = message.indexOf("改回上面骨架指定的數值");
    const shrink = message.indexOf("才縮小字級或精簡文字");
    expect(restore).toBeGreaterThan(-1);
    expect(shrink).toBeGreaterThan(restore);
  });

  it("keeps an escape hatch for text that genuinely will not fit", () => {
    expect(message).toContain("只有在文字量確實超過該框的容量時");
  });

  it("holds the page role steady", () => {
    expect(message).toContain("必須維持 content");
  });
});

describe("buildAuthoringSystemPrompt", () => {
  it("gives the frame precedence over a template's layout prose", () => {
    const prompt = buildAuthoringSystemPrompt({
      templateSpecs: [{ kind: "style", id: "editorial", spec: "全部滿版" }],
    });

    expect(prompt).toContain("一律以骨架的 bounds 為準");
  });

  it("leaves the per-page geometry out of the shared system prompt", () => {
    const prompt = buildAuthoringSystemPrompt({});
    expect(prompt).not.toContain("本頁版面骨架");
  });
});
