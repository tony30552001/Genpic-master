import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertRevisionScope,
  assertScriptFidelity,
  compileStoryboard,
  normalizeStoryboard,
  storyboardWarnings,
} = require("../videoStoryboard");

const shot = (overrides = {}) => ({
  id: "s1",
  duration: 3,
  shotSize: "wide",
  angle: "eye-level",
  camera: "slow-push-in",
  action: "咖啡師推開店門",
  environment: "木質吧台",
  ...overrides,
});

const board = (shots, global = {}) =>
  normalizeStoryboard({
    title: "晨光咖啡廳",
    global: { style: "溫暖寫實", lighting: "清晨側光", constraints: ["圍裙一致"], negative: "blur", ...global },
    shots,
  });

describe("normalizeStoryboard", () => {
  it("rejects a shot that mixes script and structured fields", () => {
    expect(() => board([shot({ script: "原文" })])).toThrow(/不能同時/);
  });

  it("rejects unknown enum values and duplicate ids", () => {
    expect(() => board([shot({ camera: "zoom" })])).toThrow(/運鏡/);
    expect(() => board([shot(), shot()])).toThrow(/重複/);
  });
});

describe("compileStoryboard", () => {
  it("sends one Kling shot as a single prompt with constraints and negative prompt", () => {
    const compiled = compileStoryboard("kling-v3-pro", board([shot()]));
    expect(compiled).toMatchObject({
      sendMode: "single",
      prompt: "溫暖寫實. 清晨側光. Wide shot, eye level, slow push-in. 咖啡師推開店門. 木質吧台. Keep: 圍裙一致.",
      multiPrompt: null,
      negativePrompt: "blur",
    });
  });

  it("sends several Kling shots as multi_prompt and keeps script text verbatim", () => {
    const compiled = compileStoryboard(
      "kling-v3-pro",
      board([shot(), { id: "s2", duration: 2, script: "她微笑。", shotSize: null }])
    );
    expect(compiled.sendMode).toBe("multi");
    expect(compiled.multiPrompt[1]).toEqual({ prompt: "她微笑。 Keep: 圍裙一致.", duration: "2" });
    expect(JSON.parse(compiled.storedPrompt)).toEqual(compiled.multiPrompt);
  });

  it("merges MiniMax shots into one timecoded prompt", () => {
    const compiled = compileStoryboard(
      "minimax-h3-max",
      board([shot(), shot({ id: "s2", duration: 4, shotSize: "close-up", camera: "static", action: "她微笑" })])
    );
    expect(compiled.prompt).toBe(
      "Overall style: 溫暖寫實. Lighting: 清晨側光. Consistency: 圍裙一致. Avoid: blur.\n" +
      "[00:00–00:03] Wide shot, eye level, slow push-in. 咖啡師推開店門. 木質吧台.\n" +
      "[00:03–00:07] Close-up, eye level, static camera. 她微笑. 木質吧台."
    );
  });

  it("rejects a compiled prompt over the model limit", () => {
    expect(() =>
      compileStoryboard("minimax-h3-max", board([shot({ action: "走".repeat(1000) }), shot({ id: "s2", action: "走".repeat(1000) }), shot({ id: "s3", action: "走".repeat(600) })]))
    ).toThrow(/2500/);
  });
});

describe("storyboardWarnings", () => {
  it("flags crowded, conflicting and static structured shots", () => {
    const warnings = storyboardWarnings(board([
      shot({ duration: 2, action: "她走進店裡，然後坐下" }),
      shot({ id: "s2", camera: "static", action: "鏡頭推近咖啡杯" }),
      shot({ id: "s3", action: "一杯咖啡" }),
    ]));
    expect(warnings.map((item) => [item.shotId, item.code])).toEqual([
      ["s1", "too_many_actions"],
      ["s2", "camera_conflict"],
      ["s3", "static_action"],
    ]);
  });

  it("flags image references in scripts only when there is no start frame", () => {
    const storyboard = board([{ id: "s1", duration: 3, script: "依照 @Image1 的構圖推進" }]);
    expect(storyboardWarnings(storyboard)).toHaveLength(1);
    expect(storyboardWarnings(storyboard, { hasStartFrame: true })).toHaveLength(0);
  });
});

describe("assertRevisionScope", () => {
  it("returns changed shots and rejects undeclared changes", () => {
    const before = board([shot(), shot({ id: "s2" })]);
    const after = board([shot(), shot({ id: "s2", action: "夜景" })]);
    expect(assertRevisionScope({ before, after, declaredChangedIds: ["s2"] })).toEqual(["s2"]);
    expect(() => assertRevisionScope({ before, after, declaredChangedIds: [] })).toThrow(/沒有標示/);
    expect(() =>
      assertRevisionScope({ before, after, declaredChangedIds: ["s2"], shotId: "s1" })
    ).toThrow(/指定幕以外/);
  });
});

describe("assertScriptFidelity", () => {
  const source = "場景 1\n她推開門。\n\n場景 2\n他  抬頭微笑。";

  it("accepts in-order verbatim scenes regardless of whitespace", () => {
    expect(() =>
      assertScriptFidelity(source, board([
        { id: "s1", duration: 3, script: "她推開門。" },
        { id: "s2", duration: 3, script: "他 抬頭微笑。" },
      ]))
    ).not.toThrow();
  });

  it("rejects rewritten or reordered scenes", () => {
    expect(() =>
      assertScriptFidelity(source, board([{ id: "s1", duration: 3, script: "她打開門。" }]))
    ).toThrow(/不一致/);
    expect(() =>
      assertScriptFidelity(source, board([
        { id: "s1", duration: 3, script: "他 抬頭微笑。" },
        { id: "s2", duration: 3, script: "她推開門。" },
      ]))
    ).toThrow(/第 2 幕/);
  });
});
