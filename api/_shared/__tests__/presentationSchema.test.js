import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeDocumentScene,
  normalizePresentationSlide,
  normalizePresentationSlides,
  normalizeChart,
  normalizeTable,
} = require("../presentationSchema");

describe("presentationSchema", () => {
  it("normalizes scene fields and keeps structured visuals", () => {
    const scene = normalizeDocumentScene({
      scene_number: 2,
      scene_title: "營收趨勢",
      scene_description: "季度營收變化",
      layout_type: "chart",
      bullet_points: ["成長", 2025, ""],
      tables: [{ headers: ["Q", "Revenue"], rows: [["Q1", 100]] }],
      charts: [{
        type: "column",
        labels: ["Q1"],
        series: [{ name: "Revenue", values: [100] }],
      }],
    }, 0);

    expect(scene).toMatchObject({
      scene_number: 2,
      layout_type: "chart",
      bullet_points: ["成長", "2025"],
      tables: [{ headers: ["Q", "Revenue"], rows: [["Q1", "100"]] }],
      charts: [{
        type: "bar",
        labels: ["Q1"],
        series: [{ name: "Revenue", values: [100] }],
      }],
    });
  });

  it("falls back to safe layout and scene number values", () => {
    const scene = normalizeDocumentScene({
      scene_title: "",
      layout_type: "unsupported",
      tables: "invalid",
      charts: [{ labels: [], series: [] }],
    }, 3);

    expect(scene.scene_number).toBe(4);
    expect(scene.scene_title).toBe("場景 4");
    expect(scene.layout_type).toBe("default");
    expect(scene.tables).toEqual([]);
    expect(scene.charts).toEqual([]);
  });

  it("normalizes independent presentation slide content", () => {
    const slides = normalizePresentationSlides([
      {
        slide_number: 8,
        slide_type: "content",
        title: "營收趨勢",
        subtitle: "季度營收持續成長",
        bullets: ["成長", 2025, ""],
        table: { headers: ["季度", "營收"], rows: [["Q1", 100]] },
        chart: {
          type: "column",
          labels: ["Q1"],
          series: [{ name: "營收", values: [100] }],
        },
      },
    ]);

    expect(slides[0]).toMatchObject({
      slide_number: 1,
      slide_type: "content",
      title: "營收趨勢",
      bullets: ["成長", "2025"],
      table: { headers: ["季度", "營收"], rows: [["Q1", "100"]] },
      chart: {
        type: "bar",
        labels: ["Q1"],
        series: [{ name: "營收", values: [100] }],
      },
    });
    expect(normalizePresentationSlide({ slide_type: "closing", title: "結語" }, 2)).toMatchObject({
      slide_number: 3,
      slide_type: "closing",
      title: "結語",
    });
    expect(normalizePresentationSlide({ slide_type: "unknown", title: "內容" })).toMatchObject({
      slide_type: "content",
    });
  });

  it("rejects structured visuals without usable content", () => {
    expect(normalizeTable({ rows: [["", null]] })).toBeNull();
    expect(normalizeChart({ labels: ["A"], series: [{ values: ["not a number"] }] })).toBeNull();
    expect(normalizePresentationSlides([{}])).toEqual([]);
  });
});
