import { describe, it, expect } from "vitest";

/**
 * Tests for PPTX export bullet_points logic.
 *
 * The core logic lives inline in DocumentScenes.jsx::exportToPptx().
 * We test the pure business rules here to avoid needing a full DOM/canvas environment.
 */

/** Mirror of the bullet extraction logic in exportToPptx */
const extractBullets = (scene) =>
  Array.isArray(scene.bullet_points) && scene.bullet_points.length > 0
    ? scene.bullet_points
    : [scene.scene_description || ""].filter(Boolean);

/**
 * Mirror of the API-level defensive field guard (api/analyze-document/index.js line 499)
 * Note: .map(String) coerces numbers/booleans to strings.
 *       .filter(Boolean) removes empty strings — but NOT null/undefined (they become "null"/"undefined").
 */
const guardBulletPoints = (raw) =>
  Array.isArray(raw.bullet_points)
    ? raw.bullet_points.map(String).filter(Boolean)
    : [];

describe("PPTX export — bullet_points logic", () => {
  it("uses bullet_points when present", () => {
    const scene = { bullet_points: ["Point A", "Point B"], scene_description: "Desc" };
    expect(extractBullets(scene)).toEqual(["Point A", "Point B"]);
  });

  it("falls back to scene_description when bullet_points is empty array", () => {
    const scene = { bullet_points: [], scene_description: "Fallback desc" };
    expect(extractBullets(scene)).toEqual(["Fallback desc"]);
  });

  it("falls back to scene_description when bullet_points is undefined", () => {
    const scene = { scene_description: "Only desc" };
    expect(extractBullets(scene)).toEqual(["Only desc"]);
  });

  it("returns empty array when both bullet_points and scene_description are missing", () => {
    const scene = {};
    expect(extractBullets(scene)).toEqual([]);
  });

  it("ignores non-array bullet_points and uses scene_description", () => {
    const scene = { bullet_points: "not an array", scene_description: "Desc" };
    expect(extractBullets(scene)).toEqual(["Desc"]);
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

  it("returns [] when bullet_points is a string (Gemini hallucination)", () => {
    expect(guardBulletPoints({ bullet_points: "bullet one, bullet two" })).toEqual([]);
  });

  it("returns [] when bullet_points is a number", () => {
    expect(guardBulletPoints({ bullet_points: 3 })).toEqual([]);
  });

  it("preserves an empty array", () => {
    expect(guardBulletPoints({ bullet_points: [] })).toEqual([]);
  });

  it("coerces numbers to strings (Gemini hallucination)", () => {
    expect(guardBulletPoints({ bullet_points: [1, 2, 3] })).toEqual(["1", "2", "3"]);
  });

  it("filters out empty strings", () => {
    expect(guardBulletPoints({ bullet_points: ["a", "", "b"] })).toEqual(["a", "b"]);
  });
});

/**
 * Mirror of filename sanitization in exportToPptx()
 * src/components/create/DocumentScenes.jsx: safeTitle logic
 */
const sanitizeFilename = (title) =>
  (title || "presentation")
    .replace(/[^\w\u4e00-\u9fff\s-]/g, "")
    .trim() || "presentation";

describe("PPTX export — filename sanitization", () => {
  it("preserves ASCII alphanumeric and spaces", () => {
    expect(sanitizeFilename("My Presentation 2024")).toBe("My Presentation 2024");
  });

  it("preserves CJK characters", () => {
    expect(sanitizeFilename("投影片主題")).toBe("投影片主題");
  });

  it("strips special characters like ! ( ) .", () => {
    expect(sanitizeFilename("My Plan! (v2)")).toBe("My Plan v2");
  });

  it("falls back to 'presentation' when title is empty string", () => {
    expect(sanitizeFilename("")).toBe("presentation");
  });

  it("falls back to 'presentation' when title is all special chars", () => {
    expect(sanitizeFilename("!!!")).toBe("presentation");
  });

  it("falls back to 'presentation' when title is null/undefined", () => {
    expect(sanitizeFilename(null)).toBe("presentation");
    expect(sanitizeFilename(undefined)).toBe("presentation");
  });

  it("preserves hyphens and underscores", () => {
    expect(sanitizeFilename("my_deck-v2")).toBe("my_deck-v2");
  });
});
