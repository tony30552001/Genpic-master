import { describe, expect, it } from "vitest";

import {
  DECK_RECIPES,
  DECK_RECIPE_IDS,
  buildRecipePlan,
  describeRecipeSpine,
  normalizeRecipeId,
} from "../deckRecipes";
import { DECK_MAX_SLIDES, DECK_MIN_SLIDES } from "../deckContract";
import { DEFAULT_FRAME_BY_PAGE_ROLE } from "../deckFrames";

const recipeIds = Object.keys(DECK_RECIPES);

describe("normalizeRecipeId", () => {
  it("collapses anything unknown to the no-op recipe", () => {
    expect(normalizeRecipeId("pitch-deck")).toBe("pitch-deck");
    expect(normalizeRecipeId(" pitch-deck ")).toBe("pitch-deck");
    expect(normalizeRecipeId("nope")).toBe("general");
    expect(normalizeRecipeId(undefined)).toBe("general");
    expect(normalizeRecipeId("general")).toBe("general");
  });
});

describe("recipe definitions", () => {
  it("lists general alongside every defined recipe", () => {
    expect(DECK_RECIPE_IDS).toEqual(["general", ...recipeIds]);
  });

  it.each(recipeIds)("%s opens on a cover and closes on an ending", (id) => {
    const { sections } = DECK_RECIPES[id];
    expect(sections[0].role).toBe("cover");
    expect(sections[sections.length - 1].role).toBe("ending");
  });

  it.each(recipeIds)("%s uses only roles the frame vocabulary serves", (id) => {
    for (const section of DECK_RECIPES[id].sections) {
      expect(DEFAULT_FRAME_BY_PAGE_ROLE[section.role]).toBeTruthy();
    }
  });

  it.each(recipeIds)("%s suggests a page count the API will accept", (id) => {
    const { defaultSlideCount } = DECK_RECIPES[id];
    expect(defaultSlideCount).toBeGreaterThanOrEqual(DECK_MIN_SLIDES);
    expect(defaultSlideCount).toBeLessThanOrEqual(DECK_MAX_SLIDES);
  });
});

describe("buildRecipePlan", () => {
  it("returns nothing for the no-op recipe, leaving the outline free", () => {
    expect(buildRecipePlan("general", 10)).toBeNull();
    expect(buildRecipePlan("nope", 10)).toBeNull();
  });

  it.each(recipeIds)("%s produces exactly the requested page count", (id) => {
    for (let count = DECK_MIN_SLIDES; count <= DECK_MAX_SLIDES; count += 1) {
      expect(buildRecipePlan(id, count)).toHaveLength(count);
    }
  });

  /**
   * Shortening drops the least essential sections; it must never truncate,
   * because a pitch that loses its call to action has lost its purpose.
   */
  it.each(recipeIds)("%s keeps its opening and its close at any length", (id) => {
    for (let count = DECK_MIN_SLIDES; count <= DECK_MAX_SLIDES; count += 1) {
      const plan = buildRecipePlan(id, count);
      expect(plan[0].role).toBe("cover");
      expect(plan[plan.length - 1].role).toBe("ending");
    }
  });

  it.each(recipeIds)("%s preserves narrative order when it drops sections", (id) => {
    const full = DECK_RECIPES[id].sections;
    const short = buildRecipePlan(id, DECK_MIN_SLIDES);
    const positions = short.map((section) => full.indexOf(section));

    expect(positions.every((value) => value >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it.each(recipeIds)("%s drops the least essential sections first", (id) => {
    const full = DECK_RECIPES[id].sections;
    const short = buildRecipePlan(id, full.length - 1);
    const dropped = full.filter((section) => !short.includes(section));

    expect(dropped).toHaveLength(1);
    for (const kept of short) {
      expect(kept.priority).toBeLessThanOrEqual(dropped[0].priority);
    }
  });

  it("adds supplementary body pages before the ending, never after it", () => {
    const full = DECK_RECIPES["pitch-deck"].sections;
    const plan = buildRecipePlan("pitch-deck", full.length + 3);

    expect(plan[plan.length - 1]).toBe(full[full.length - 1]);
    expect(plan.slice(full.length - 1, plan.length - 1).every((s) => s.role === "content")).toBe(
      true
    );
  });

  it("rejects a page count that is not a usable number", () => {
    expect(buildRecipePlan("pitch-deck", 0)).toBeNull();
    expect(buildRecipePlan("pitch-deck", "many")).toBeNull();
  });
});

describe("describeRecipeSpine", () => {
  it("says nothing when no recipe applies", () => {
    expect(describeRecipeSpine("general", 10)).toBe("");
  });

  it("numbers every page and states what it must answer", () => {
    const text = describeRecipeSpine("pitch-deck", 6);

    expect(text).toContain("投資提案");
    expect(text).toContain("1. （cover）");
    expect(text).toContain("6. （ending）");
  });

  /** The recipe owns the shape of the argument; the model owns the material. */
  it("leaves the content to the model", () => {
    const text = describeRecipeSpine("training", 8);
    expect(text).toContain("由你依素材決定");
    expect(text).toContain("不要用空話填滿");
  });
});
