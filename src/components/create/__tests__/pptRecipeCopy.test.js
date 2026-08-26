import { describe, expect, it } from "vitest";

import { DECK_RECIPE_OPTIONS, DEFAULT_RECIPE_ID, describeRecipe } from "../pptRecipeCopy";
import { IMAGE_DENSITY_OPTIONS } from "../pptTemplateCopy";
import {
  DECK_RECIPE_IDS,
  DEFAULT_RECIPE_ID as BACKEND_DEFAULT_RECIPE_ID,
} from "../../../../api/_shared/deckRecipes";

describe("pptRecipeCopy", () => {
  it("涵蓋後端認得的每一個配方 id，且順序一致", () => {
    expect(DECK_RECIPE_OPTIONS.map((option) => option.id)).toEqual([...DECK_RECIPE_IDS]);
  });

  it("預設配方與後端一致", () => {
    expect(DEFAULT_RECIPE_ID).toBe(BACKEND_DEFAULT_RECIPE_ID);
    expect(DECK_RECIPE_OPTIONS[0].id).toBe(DEFAULT_RECIPE_ID);
  });

  it("建議配圖密度必須是選擇器提供的值", () => {
    const densityIds = IMAGE_DENSITY_OPTIONS.map((option) => option.id);
    for (const option of DECK_RECIPE_OPTIONS) {
      if (option.defaultImageDensity === null) continue;
      expect(densityIds).toContain(option.defaultImageDensity);
    }
  });

  it("建議頁數落在選擇器允許的區間內", () => {
    for (const option of DECK_RECIPE_OPTIONS) {
      if (option.defaultSlideCount === null) continue;
      expect(option.defaultSlideCount).toBeGreaterThanOrEqual(4);
      expect(option.defaultSlideCount).toBeLessThanOrEqual(20);
    }
  });

  it("每個配方都有可顯示的名稱與說明", () => {
    for (const option of DECK_RECIPE_OPTIONS) {
      expect(option.name.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it("未知 id 退回預設配方", () => {
    expect(describeRecipe("nope").id).toBe(DEFAULT_RECIPE_ID);
    expect(describeRecipe(undefined).id).toBe(DEFAULT_RECIPE_ID);
  });

  it("已知 id 取得對應配方", () => {
    expect(describeRecipe("pitch-deck").name).toBe("投資提案");
  });
});
