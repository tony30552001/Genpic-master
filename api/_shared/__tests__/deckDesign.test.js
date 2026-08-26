import { describe, expect, it } from "vitest";

import {
  DEFAULT_DESIGN_SYSTEM,
  MIN_CONTRAST_RATIO,
  buildDesignSystemPrompt,
  contrastRatio,
  describeDesignSystem,
  normalizeDesignSystem,
} from "../deckDesign";

const goodPalette = {
  background: "#FFFFFF",
  surface: "#F1F3F5",
  ink: "#101418",
  muted: "#5A6169",
  accent: "#B4472A",
  accentSoft: "#F6DED6",
};

const goodSystem = (overrides = {}) => ({
  name: "Warm Archive",
  palette: goodPalette,
  chartPalette: ["#B4472A", "#2F6FEB", "#27AE60"],
  typeScale: { display: 96, title: 48, subtitle: 26, body: 20, caption: 14 },
  grid: {
    margin: { top: 96, right: 112, bottom: 96, left: 112 },
    columns: 12,
    gutter: 28,
    titleBaseline: 160,
    rhythm: "區塊之間至少空 40。",
  },
  decoration: "以細線分隔",
  rules: ["每頁一個強調色", "標題齊左"],
  artDirection: "Warm archival illustration",
  ...overrides,
});

describe("normalizeDesignSystem", () => {
  it("keeps a well-formed system and uppercases its colours", () => {
    const system = normalizeDesignSystem(
      goodSystem({ palette: { ...goodPalette, accent: "#b4472a" } })
    );

    expect(system.name).toBe("Warm Archive");
    expect(system.palette.accent).toBe("#B4472A");
    expect(system.typeScale.display).toBe(96);
    expect(system.grid.columns).toBe(12);
  });

  it("expands shorthand hex rather than discarding a usable palette", () => {
    const system = normalizeDesignSystem(
      goodSystem({ palette: { ...goodPalette, background: "#fff" } })
    );

    expect(system.palette.background).toBe("#FFFFFF");
  });

  /**
   * All-or-nothing is deliberate: mixing one model colour into the default
   * palette produces a combination nobody designed.
   */
  it("discards the whole palette when any colour is unusable", () => {
    const system = normalizeDesignSystem(
      goodSystem({ palette: { ...goodPalette, muted: "not a colour" } })
    );

    expect(system.palette).toEqual(DEFAULT_DESIGN_SYSTEM.palette);
  });

  it("rejects a palette nobody could read", () => {
    const system = normalizeDesignSystem(
      goodSystem({ palette: { ...goodPalette, ink: "#F4F4F4" } })
    );

    expect(contrastRatio("#F4F4F4", "#FFFFFF")).toBeLessThan(MIN_CONTRAST_RATIO);
    expect(system.palette).toEqual(DEFAULT_DESIGN_SYSTEM.palette);
  });

  /**
   * An inverted type scale corrupts every page at once and no per-page repair
   * can recover it, so the ordering is enforced rather than merely clamped.
   */
  it("forces the type scale to descend", () => {
    const system = normalizeDesignSystem(
      goodSystem({ typeScale: { display: 60, title: 56, subtitle: 30, body: 24, caption: 16 } })
    );
    const { display, title, subtitle, body, caption } = system.typeScale;

    expect(display).toBeGreaterThan(title);
    expect(title).toBeGreaterThan(subtitle);
    expect(subtitle).toBeGreaterThan(body);
    expect(body).toBeGreaterThan(caption);
  });

  it("clamps type sizes that would break the canvas", () => {
    const system = normalizeDesignSystem(
      goodSystem({ typeScale: { display: 400, title: 300, subtitle: 200, body: 120, caption: 90 } })
    );

    expect(system.typeScale.display).toBeLessThanOrEqual(110);
    expect(system.typeScale.caption).toBeLessThanOrEqual(16);
  });

  it("pads a thin chart palette and drops duplicates", () => {
    const system = normalizeDesignSystem(
      goodSystem({ chartPalette: ["#B4472A", "#b4472a"] })
    );

    expect(new Set(system.chartPalette).size).toBe(system.chartPalette.length);
    expect(system.chartPalette.length).toBeGreaterThanOrEqual(3);
  });

  it("keeps the grid inside the safe area", () => {
    const system = normalizeDesignSystem(
      goodSystem({
        grid: { margin: { top: 4, right: 4, bottom: 4, left: 4 }, columns: 40, gutter: 400, titleBaseline: 700 },
      })
    );

    expect(system.grid.margin.left).toBeGreaterThanOrEqual(96);
    expect(system.grid.margin.top).toBeGreaterThanOrEqual(80);
    expect(system.grid.columns).toBeLessThanOrEqual(12);
    expect(system.grid.titleBaseline).toBeLessThanOrEqual(260);
  });

  it("falls back entirely on junk input", () => {
    expect(normalizeDesignSystem(null)).toEqual(DEFAULT_DESIGN_SYSTEM);
    expect(normalizeDesignSystem("nope")).toEqual(DEFAULT_DESIGN_SYSTEM);
  });
});

describe("describeDesignSystem", () => {
  const text = describeDesignSystem(normalizeDesignSystem(goodSystem()));

  it("states hard numbers, because adjectives do not survive per-page authoring", () => {
    expect(text).toContain("#B4472A");
    expect(text).toContain("頁標題基線固定 y=160");
    expect(text).toContain("12 欄");
  });

  it("tells the author how to opt out of the safe area", () => {
    expect(text).toContain('data-pptx-bleed="true"');
  });
});

describe("buildDesignSystemPrompt", () => {
  it("asks for the deck's own language rather than a generic one", () => {
    const prompt = buildDesignSystemPrompt({
      templateSpecs: [{ kind: "style", id: "editorial", spec: "沉穩編輯風" }],
    });

    expect(prompt).toContain("沉穩編輯風");
    expect(prompt).toContain("grid");
  });
});
