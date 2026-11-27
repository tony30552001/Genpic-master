import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  assertRevisionScope,
  assertSceneFidelity,
  assertScriptFidelity,
  compileStoryboard,
  normalizeStoryboard,
  planSegments,
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

const T2V = { mode: "t2v" };
const I2V = { mode: "i2v" };
const character = (overrides = {}) => ({
  id: "c1",
  name: "咖啡師",
  description: "短髮，深綠圍裙",
  uploadIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  ...overrides,
});
const mug = character({
  id: "c2",
  name: "馬克杯",
  description: "",
  uploadIds: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
  imageLabel: "image2",
});

describe("normalizeStoryboard", () => {
  it("rejects a shot that mixes script and structured fields", () => {
    expect(() => board([shot({ script: "原文" })])).toThrow(/不能同時/);
  });

  it("rejects unknown enum values and duplicate ids", () => {
    expect(() => board([shot({ camera: "zoom" })])).toThrow(/運鏡/);
    expect(() => board([shot(), shot()])).toThrow(/重複/);
  });

  it("validates characters and the shots that tag them", () => {
    expect(board([shot()], { characters: [mug] }).global.characters[0].imageLabel).toBe("Image2");
    expect(() => board([shot()], { characters: [character({ uploadIds: [mug.uploadIds[0]] })] })).toThrow(/參考圖/);
    expect(() => board([shot({ characterIds: ["c9"] })], { characters: [character()] })).toThrow(/不存在/);
    expect(() =>
      board([shot()], { characters: [character(), character({ id: "c2" }), character({ id: "c3" }), character({ id: "c4" })] })
    ).toThrow(/最多 3/);
  });

  it("allows a start frame only on a shot that starts a segment", () => {
    const frame = "55555555-5555-4555-8555-555555555555";
    const references = [{ label: "image1", uploadId: frame }];
    const value = board([shot({ references, startFrameUploadId: frame }), shot({ id: "s2", cut: true, startFrameUploadId: frame })]);
    expect(value.shots[0].references).toEqual([{ label: "Image1", uploadId: frame }]);
    expect(value.shots[1].startFrameUploadId).toBe(frame);
    expect(() => board([shot(), shot({ id: "s2", startFrameUploadId: frame })])).toThrow(/場景開頭/);
    expect(() => board([shot({ references: [...references, ...references] })])).toThrow(/代號重複/);
  });
});

describe("planSegments", () => {
  const kling = { family: "kling-v3-pro", maxDurationSeconds: 15 };
  const shots = (durations, overrides = {}) =>
    durations.map((duration, index) => shot({ id: `s${index + 1}`, duration, ...overrides[index] }));
  const plan = (value, mode = "t2v") =>
    planSegments(board(value), kling, { mode }).map(({ shotIds, durationSeconds, chained, mode: segmentMode }) => ({
      shotIds,
      durationSeconds,
      chained,
      mode: segmentMode,
    }));

  it("chains segments when a scene runs past the model length", () => {
    expect(plan(shots([10, 5, 6]), "i2v")).toEqual([
      { shotIds: ["s1", "s2"], durationSeconds: 15, chained: false, mode: "i2v" },
      { shotIds: ["s3"], durationSeconds: 6, chained: true, mode: "i2v" },
    ]);
  });

  it("starts an unchained text-to-video segment at a scene cut", () => {
    expect(plan(shots([5, 5], { 1: { cut: true } }))).toEqual([
      { shotIds: ["s1"], durationSeconds: 5, chained: false, mode: "t2v" },
      { shotIds: ["s2"], durationSeconds: 5, chained: false, mode: "t2v" },
    ]);
    expect(board(shots([5], { 0: { cut: true } })).shots[0].cut).toBe(false);
  });

  it("caps a segment's shot count", () => {
    expect(plan(shots([2, 2, 2, 2, 2, 2, 3])).map((segment) => segment.shotIds.length)).toEqual([6, 1]);
  });

  it("rejects segments that are too short and projects that are too long", () => {
    expect(() => plan(shots([5, 2], { 1: { cut: true } }))).toThrow(/第 2 段（第 2 幕）只有 2 秒/);
    expect(() => planSegments(board(shots([12])), { ...kling, maxDurationSeconds: 10 }, T2V)).toThrow(/每段 10 秒/);
    expect(() => plan(shots(Array(9).fill(14)))).toThrow(/120 秒上限/);
  });

  it("starts a cut segment from its first shot's start frame", () => {
    const frame = "55555555-5555-4555-8555-555555555555";
    const value = shots([5, 5], { 1: { cut: true, startFrameUploadId: frame } });
    expect(planSegments(board(value), kling, T2V).map(({ mode, startFrameUploadId }) => ({ mode, startFrameUploadId })))
      .toEqual([
        { mode: "t2v", startFrameUploadId: null },
        { mode: "i2v", startFrameUploadId: frame },
      ]);
    expect(() => plan(shots([5], { 0: { startFrameUploadId: frame } }), "i2v")).toThrow(/首影格/);
  });
});
describe("compileStoryboard characters", () => {
  const cast = (overrides = {}) =>
    board(
      [
        shot({ characterIds: ["c1"] }),
        { id: "s2", duration: 2, script: "@Image2 放在吧台上，@Image3 在後方", characterIds: [] },
      ],
      { characters: [character(), mug], ...overrides }
    );

  it("sends tagged and script-bound characters as Kling elements with a start frame", () => {
    const compiled = compileStoryboard("kling-v3-pro", cast(), I2V);
    expect(compiled.characterMode).toBe("elements");
    expect(compiled.elements.map((item) => item.characterId)).toEqual(["c1", "c2"]);
    expect(compiled.multiPrompt[0].prompt).toContain("Characters: @Element1 (咖啡師).");
    expect(compiled.multiPrompt[1].prompt).toBe("@Element2 放在吧台上，@Image3 在後方 Keep: 圍裙一致.");
  });

  it("numbers elements by use and skips characters no shot features", () => {
    const compiled = compileStoryboard(
      "kling-v3-pro",
      board([shot({ characterIds: ["c2"] })], { characters: [character(), { ...mug, imageLabel: null }] }),
      I2V
    );
    expect(compiled.elements.map((item) => item.characterId)).toEqual(["c2"]);
    expect(compiled.prompt).toContain("@Element1 (馬克杯)");
  });

  it("writes characters as text without a start frame and for MiniMax", () => {
    const kling = compileStoryboard("kling-v3-pro", cast(), T2V);
    expect(kling).toMatchObject({ characterMode: "text", elements: [] });
    expect(kling.multiPrompt[0].prompt).toContain("Characters: 咖啡師（短髮，深綠圍裙）.");
    expect(kling.multiPrompt[1].prompt).toContain("馬克杯 放在吧台上");
    const minimax = compileStoryboard("minimax-h3-max", cast(), I2V);
    expect(minimax.characterMode).toBe("text");
    expect(minimax.prompt).toContain("[00:00–00:03] Wide shot, eye level, slow push-in. Characters: 咖啡師（短髮，深綠圍裙）. 咖啡師推開店門.");
  });
});

describe("compileStoryboard", () => {
  it("reports no characters when the storyboard has none", () => {
    expect(compileStoryboard("kling-v3-pro", board([shot()]), I2V)).toMatchObject({ characterMode: "none", elements: [] });
  });
  it("sends one Kling shot as a single prompt with constraints and negative prompt", () => {
    const compiled = compileStoryboard("kling-v3-pro", board([shot()]), T2V);
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
      board([shot(), { id: "s2", duration: 2, script: "她微笑。", shotSize: null }]),
      T2V
    );
    expect(compiled.sendMode).toBe("multi");
    expect(compiled.multiPrompt[1]).toEqual({ prompt: "她微笑。 Keep: 圍裙一致.", duration: "2" });
    expect(JSON.parse(compiled.storedPrompt)).toEqual(compiled.multiPrompt);
  });

  it("merges MiniMax shots into one timecoded prompt", () => {
    const compiled = compileStoryboard(
      "minimax-h3-max",
      board([shot(), shot({ id: "s2", duration: 4, shotSize: "close-up", camera: "static", action: "她微笑" })]),
      T2V
    );
    expect(compiled.prompt).toBe(
      "Overall style: 溫暖寫實. Lighting: 清晨側光. Consistency: 圍裙一致. Avoid: blur.\n" +
      "[00:00–00:03] Wide shot, eye level, slow push-in. 咖啡師推開店門. 木質吧台.\n" +
      "[00:03–00:07] Close-up, eye level, static camera. 她微笑. 木質吧台."
    );
  });

  it("rejects a compiled prompt over the model limit", () => {
    expect(() =>
      compileStoryboard("minimax-h3-max", board([shot({ action: "走".repeat(1000) }), shot({ id: "s2", action: "走".repeat(1000) }), shot({ id: "s3", action: "走".repeat(600) })]), T2V)
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

  it("does not flag script references bound to a character", () => {
    const bound = board([{ id: "s1", duration: 3, script: "@Image2 放在吧台上" }], { characters: [mug] });
    expect(storyboardWarnings(bound)).toHaveLength(0);
    const unbound = board([{ id: "s1", duration: 3, script: "@Image2 旁邊是 @Image1" }], { characters: [mug] });
    expect(storyboardWarnings(unbound)[0].message).toMatch(/@Image1/);
  });
});

describe("assertRevisionScope", () => {
  it("returns changed shots and rejects undeclared changes", () => {
    const before = board([shot(), shot({ id: "s2" })]);
    const after = board([shot(), shot({ id: "s2", action: "夜景" })]);
    expect(assertRevisionScope({ before, after, declaredChangedIds: ["s2"] })).toEqual(["s2"]);
    expect(() => assertRevisionScope({ before, after, declaredChangedIds: [] })).toThrow(/沒有標示/);
    expect(() =>
      assertRevisionScope({ before, after, declaredChangedIds: ["s2"], shotIds: ["s1"] })
    ).toThrow(/指定幕以外/);
    expect(assertRevisionScope({ before, after, declaredChangedIds: ["s2"], shotIds: ["s1", "s2"] })).toEqual(["s2"]);
  });
});

describe("assertSceneFidelity", () => {
  const scenes = [
    { title: "開店", text: "她推開門。" },
    { title: "吧台", text: "他\n抬頭微笑。" },
  ];

  it("requires one verbatim shot per document scene", () => {
    const shots = [
      { id: "s1", duration: 3, script: "她推開門。" },
      { id: "s2", duration: 3, script: "他 抬頭微笑。" },
    ];
    expect(() => assertSceneFidelity(scenes, board(shots))).not.toThrow();
    expect(() => assertSceneFidelity(scenes, board(shots.slice(0, 1)))).toThrow(/2 個場景/);
    expect(() =>
      assertSceneFidelity(scenes, board([shots[0], { ...shots[1], script: "他微笑。" }]))
    ).toThrow(/吧台/);
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
