import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  normalizeDocumentScene,
  normalizeChart,
  normalizeTable,
} = require("../documentScene");

describe("documentScene", () => {
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

  it("rejects structured visuals without usable content", () => {
    expect(normalizeTable({ rows: [["", null]] })).toBeNull();
    expect(normalizeChart({ labels: ["A"], series: [{ values: ["not a number"] }] })).toBeNull();
  });
});
