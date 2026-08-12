import { describe, it, expect } from "vitest";
import {
  extractPptxBullets,
  getPptxCharts,
  getPptxScenes,
  getPptxTables,
  normalizePptxChart,
  normalizePptxTable,
  sanitizePptxFilename,
} from "../pptxExport";

const guardBulletPoints = (raw) =>
  Array.isArray(raw.bullet_points)
    ? raw.bullet_points.map(String).filter(Boolean)
    : [];

describe("PPTX export — bullet_points logic", () => {
  it("uses bullet_points when present", () => {
    const scene = { bullet_points: ["Point A", "Point B"], scene_description: "Desc" };
    expect(extractPptxBullets(scene)).toEqual(["Point A", "Point B"]);
  });

  it("falls back to scene_description when bullet_points is empty array", () => {
    const scene = { bullet_points: [], scene_description: "Fallback desc" };
    expect(extractPptxBullets(scene)).toEqual(["Fallback desc"]);
  });

  it("falls back to scene_description when bullet_points is undefined", () => {
    const scene = { scene_description: "Only desc" };
    expect(extractPptxBullets(scene)).toEqual(["Only desc"]);
  });

  it("returns empty array when both bullet_points and scene_description are missing", () => {
    const scene = {};
    expect(extractPptxBullets(scene)).toEqual([]);
  });

  it("ignores non-array bullet_points and uses scene_description", () => {
    const scene = { bullet_points: "not an array", scene_description: "Desc" };
    expect(extractPptxBullets(scene)).toEqual(["Desc"]);
  });

  it("removes empty and null bullet points", () => {
    expect(extractPptxBullets({ bullet_points: ["a", "", null, " b "] })).toEqual(["a", "b"]);
  });
});

describe("API defensive guard — bullet_points field", () => {
  it("preserves a valid array", () => {
    expect(guardBulletPoints({ bullet_points: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("returns [] when bullet_points is undefined", () => {
    expect(guardBulletPoints({})).toEqual([]);
  });

  it("returns [] when bullet_points is null", () => {
    expect(guardBulletPoints({ bullet_points: null })).toEqual([]);
  });

  it("returns [] when bullet_points is a string", () => {
    expect(guardBulletPoints({ bullet_points: "bullet one, bullet two" })).toEqual([]);
  });

  it("returns [] when bullet_points is a number", () => {
    expect(guardBulletPoints({ bullet_points: 3 })).toEqual([]);
  });

  it("preserves an empty array", () => {
    expect(guardBulletPoints({ bullet_points: [] })).toEqual([]);
  });

  it("coerces numbers to strings", () => {
    expect(guardBulletPoints({ bullet_points: [1, 2, 3] })).toEqual(["1", "2", "3"]);
  });

  it("filters out empty strings", () => {
    expect(guardBulletPoints({ bullet_points: ["a", "", "b"] })).toEqual(["a", "b"]);
  });
});

describe("PPTX export — analyzed scene selection", () => {
  it("keeps every analyzed scene even when no image exists", () => {
    const scenes = [
      { scene_number: 1, scene_title: "Cover" },
      { scene_number: 2, scene_title: "Plan", generatedImage: "data:image/png;base64,abc" },
    ];

    expect(getPptxScenes(scenes)).toEqual(scenes);
  });

  it("returns an empty list for invalid input", () => {
    expect(getPptxScenes(null)).toEqual([]);
    expect(getPptxScenes([null, "invalid", { scene_title: "Valid" }])).toEqual([
      { scene_title: "Valid" },
    ]);
  });
});

describe("PPTX export — filename sanitization", () => {
  it("preserves ASCII alphanumeric and spaces", () => {
    expect(sanitizePptxFilename("My Presentation 2024")).toBe("My Presentation 2024");
  });

  it("preserves CJK characters", () => {
    expect(sanitizePptxFilename("投影片主題")).toBe("投影片主題");
  });

  it("strips special characters like ! ( ) .", () => {
    expect(sanitizePptxFilename("My Plan! (v2)")).toBe("My Plan v2");
  });

  it("falls back to 'presentation' when title is empty string", () => {
    expect(sanitizePptxFilename("")).toBe("presentation");
  });

  it("falls back to 'presentation' when title is all special chars", () => {
    expect(sanitizePptxFilename("!!!")).toBe("presentation");
  });

  it("falls back to 'presentation' when title is null/undefined", () => {
    expect(sanitizePptxFilename(null)).toBe("presentation");
    expect(sanitizePptxFilename(undefined)).toBe("presentation");
  });

  it("preserves hyphens and underscores", () => {
    expect(sanitizePptxFilename("my_deck-v2")).toBe("my_deck-v2");
  });
});

describe("PPTX export — native table and chart data", () => {
  it("normalizes a table to bounded rectangular rows", () => {
    expect(
      normalizePptxTable({
        title: "Revenue",
        headers: ["Quarter", "Amount"],
        rows: [["Q1", 100], ["Q2"], ["", ""]],
      })
    ).toEqual({
      title: "Revenue",
      headers: ["Quarter", "Amount"],
      rows: [["Q1", "100"], ["Q2", ""]],
    });
  });

  it("drops malformed tables and limits table size", () => {
    const table = normalizePptxTable({
      headers: Array.from({ length: 10 }, (_, index) => `H${index}`),
      rows: Array.from({ length: 14 }, (_, rowIndex) =>
        Array.from({ length: 10 }, (_, columnIndex) => `${rowIndex}-${columnIndex}`)
      ),
    });

    expect(table.headers).toHaveLength(8);
    expect(table.rows).toHaveLength(10);
    expect(normalizePptxTable({ rows: [["", null]] })).toBeNull();
  });

  it("normalizes chart aliases, numeric values, and missing labels", () => {
    expect(
      normalizePptxChart({
        type: "column",
        series: [{ name: "Sales", values: ["10", "bad", 30] }],
      })
    ).toEqual({
      type: "bar",
      title: "",
      labels: ["項目 1", "項目 2", "項目 3"],
      series: [{ name: "Sales", values: [10, 0, 30] }],
    });
  });

  it("returns only valid native visuals from a scene", () => {
    const scene = {
      tables: [{ headers: ["A"], rows: [["1"]] }, { headers: ["B"], rows: [["2"]] }],
      charts: [
        { type: "line", labels: ["A"], series: [{ name: "S", values: [1] }] },
      ],
    };

    expect(getPptxTables(scene)).toHaveLength(1);
    expect(getPptxCharts(scene)[0].type).toBe("line");
    expect(getPptxTables({})).toEqual([]);
    expect(getPptxCharts({ charts: [{ labels: [], series: [] }] })).toEqual([]);
  });
});
