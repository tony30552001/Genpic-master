import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import * as storyboardLimits from "../videoStoryboard";
import {
  SCRIPT_EXAMPLE,
  SCRIPT_MIN_SHOT_SECONDS,
  SCRIPT_RECOMMENDED_SCENE_LENGTH,
  SCRIPT_TEMPLATE_LIMITS,
  buildScriptPrompt,
  sceneText,
} from "../videoScriptTemplate";

const require = createRequire(import.meta.url);
const backend = require("../../../api/_shared/videoStoryboard.js");
const { listVideoFamilies } = require("../../../api/_shared/videoModelFamilies.js");

describe("video script template", () => {
  it("mirrors the backend import limits", () => {
    for (const name of ["MAX_SHOTS", "MAX_PROJECT_SECONDS", "PROMPT_LIMIT", "MAX_SCRIPT_SOURCE", "MAX_SHOT_REFERENCES", "MAX_CHARACTERS"]) {
      expect(storyboardLimits[name], name).toBe(backend[name]);
    }
    const families = listVideoFamilies();
    expect(SCRIPT_MIN_SHOT_SECONDS).toBe(Math.max(...families.map((family) => family.minDuration)));
    expect(storyboardLimits.MAX_SHOT_SECONDS).toBe(Math.min(...families.map((family) => family.maxDuration)));
  });

  it("builds the limits and prompt from the shared constants", () => {
    expect(SCRIPT_TEMPLATE_LIMITS).toContainEqual({ label: "每場字數", value: "建議 ≤1,500，上限 2,500" });
    const prompt = buildScriptPrompt();
    expect(prompt).toContain(`最多 ${storyboardLimits.MAX_SHOTS} 個場景`);
    expect(prompt).toContain(`每個場景 ${SCRIPT_MIN_SHOT_SECONDS}–${storyboardLimits.MAX_SHOT_SECONDS} 秒`);
    expect(prompt).toContain("## 場景標題");
  });

  it("keeps the example inside the limits it teaches", () => {
    const { scenes } = SCRIPT_EXAMPLE;
    expect(scenes).toHaveLength(7);
    expect(scenes.reduce((sum, scene) => sum + scene.seconds, 0)).toBeLessThanOrEqual(storyboardLimits.MAX_PROJECT_SECONDS);
    for (const scene of scenes) {
      expect(scene.seconds).toBeGreaterThanOrEqual(SCRIPT_MIN_SHOT_SECONDS);
      expect(scene.seconds).toBeLessThanOrEqual(storyboardLimits.MAX_SHOT_SECONDS);
      expect(sceneText(scene).length).toBeLessThanOrEqual(SCRIPT_RECOMMENDED_SCENE_LENGTH);
      expect(scene.text).not.toMatch(/@Image/);
    }
  });
});
