import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../auth");
const identity = require("../identity");
const rateLimit = require("../rateLimit");
const db = require("../db");
const llmModels = require("../llmModels");
const llmRuntime = require("../llmRuntime");
const videoModels = require("../videoModels");
const videoPolicy = require("../videoPolicy");
const scriptDocument = require("../scriptDocument");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.generateJson = vi.fn();
videoModels.listPublicVideoModels = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();
scriptDocument.readScriptDocument = vi.fn();
scriptDocument.importSceneImages = vi.fn();

const { runStoryboardJob } = require("../videoStoryboardJobs");

const shot = (overrides = {}) => ({
  id: "s1",
  title: null,
  script: null,
  scriptOriginal: null,
  duration: 5,
  shotSize: "wide",
  angle: "eye-level",
  camera: "slow-push-in",
  action: "咖啡師推開店門",
  environment: "木質吧台",
  ...overrides,
});
const scriptShot = (id, script, duration) => ({
  id, title: null, script, scriptOriginal: null, duration,
  shotSize: null, angle: null, camera: null, action: null, environment: null,
});
const storyboard = (shots) => ({
  title: "晨光咖啡廳",
  global: { style: "", lighting: "", constraints: [], negative: "" },
  shots,
});

// Runs an agent action the way the worker does and reads back what it stored.
const invoke = async (body) => {
  db.query.mockClear();
  await runStoryboardJob({
    id: "job-1", lock_version: 1, tenant_id: "t", user_id: "u",
    action: body.action, request: { modelKey: "kling", ...body },
  });
  const [sql, params] = db.query.mock.calls.findLast(([text]) => text.includes("UPDATE video_storyboard_jobs"));
  expect(params.slice(0, 2)).toEqual(["job-1", 1]);
  return sql.includes("'succeeded'")
    ? { status: "succeeded", body: JSON.parse(params[2]) }
    : { status: "failed", error: { code: params[2], message: params[3] } };
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAuth.mockResolvedValue({ user: { sub: "u" } });
  identity.resolveIdentity.mockResolvedValue({ tenantId: "t", userId: "u" });
  rateLimit.rateLimit.mockReturnValue({ limited: false });
  db.query.mockResolvedValue({ rows: [{ video_enabled: true }] });
  videoPolicy.ensureVideoSettings.mockResolvedValue({ allowedModels: ["kling"] });
  videoModels.listPublicVideoModels.mockResolvedValue([
    { modelKey: "kling", family: "kling-v3-pro", maxDurationSeconds: 15 },
  ]);
  llmModels.resolveRoleModel.mockResolvedValue({ model: {} });
});

const FRAME = "55555555-5555-4555-8555-555555555555";

describe("storyboard agent jobs", () => {
  it("keeps a DOCX's scenes and attaches their images after the agent copies them", async () => {
    const zip = {};
    scriptDocument.readScriptDocument.mockResolvedValue({
      kind: "scenes",
      zip,
      preface: "咖啡廣告",
      prefaceImageCount: 1,
      scenes: [
        { title: "開店", text: "她推開門。", images: [{ path: "word/media/a.png", label: "Image1" }] },
        { title: "吧台", text: "他微笑。", images: [] },
      ],
    });
    scriptDocument.importSceneImages.mockResolvedValue({
      references: [[{ label: "Image1", uploadId: FRAME }], []],
      previews: { [FRAME]: "data:image/webp;base64,AA" },
      skipped: [],
    });
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([scriptShot("s1", "她推開門。", 5), { ...scriptShot("s2", "他微笑。", 5), title: "亂取" }]),
      explanation: "已整理",
    });

    const res = await invoke({ action: "fromScript", uploadId: FRAME });

    expect(res.status).toBe("succeeded");
    expect(JSON.parse(llmRuntime.generateJson.mock.calls[0][0].userMessage).scenes[0].images).toEqual(["Image1"]);
    expect(scriptDocument.importSceneImages).toHaveBeenCalledWith(expect.objectContaining({ zip, tenantId: "t", userId: "u" }));
    expect(res.body.storyboard.shots.map(({ title, references }) => ({ title, references }))).toEqual([
      { title: "開店", references: [{ label: "Image1", uploadId: FRAME }] },
      { title: "吧台", references: [] },
    ]);
    expect(res.body.referencePreviews).toEqual({ [FRAME]: "data:image/webp;base64,AA" });
    expect(res.body.explanation).toMatch(/標題前的 1 張圖片/);
  });

  it("does not store document images when the agent rewrites a scene", async () => {
    scriptDocument.readScriptDocument.mockResolvedValue({
      kind: "scenes", zip: {}, preface: "", prefaceImageCount: 0,
      scenes: [{ title: "開店", text: "她推開門。", images: [] }],
    });
    llmRuntime.generateJson.mockResolvedValue({ storyboard: storyboard([scriptShot("s1", "她打開門。", 5)]) });
    expect((await invoke({ action: "fromScript", uploadId: FRAME })).error.code).toBe("storyboard_agent_failed");
    expect(scriptDocument.importSceneImages).not.toHaveBeenCalled();
  });

  it("requires exactly one of script text or a script document", async () => {
    expect((await invoke({ action: "fromScript", script: "場景 1", uploadId: FRAME })).status).toBe("failed");
    expect((await invoke({ action: "fromScript" })).status).toBe("failed");
  });

  it("hides shot images from the agent and restores them on revise", async () => {
    const references = [{ label: "Image1", uploadId: FRAME }];
    const before = storyboard([shot({ references, startFrameUploadId: FRAME }), shot({ id: "s2" })]);
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot(), shot({ id: "s2", environment: "夜晚街道" })]),
      changedShotIds: ["s2"],
    });
    const res = await invoke({ action: "revise", storyboard: before, instruction: "第 2 幕改成夜景" });
    expect(res.status).toBe("succeeded");
    expect(llmRuntime.generateJson.mock.calls[0][0].userMessage).not.toContain(FRAME);
    expect(res.body.storyboard.shots[0]).toMatchObject({ references, startFrameUploadId: FRAME });
    expect(res.body.changedShotIds).toEqual(["s2"]);
    expect(res.body.segments[0].mode).toBe("i2v");
  });

  it("returns a drafted storyboard with its segment requests and warnings", async () => {
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot(), shot({ id: "s2", camera: "static", action: "鏡頭推近「早安」招牌" })]),
      explanation: "假設清晨",
      questions: [],
    });
    const res = await invoke({ action: "draft", brief: "咖啡廳開店，招牌寫「早安」", durationSeconds: 10 });
    expect(res.status).toBe("succeeded");
    expect(res.body.segments).toEqual([expect.objectContaining({ index: 0, chained: false, mode: "t2v" })]);
    expect(res.body.segments[0].compiled.sendMode).toBe("multi");
    expect(res.body.warnings).toEqual([expect.objectContaining({ shotId: "s2", code: "camera_conflict" })]);
  });

  it("fails when the agent drops quoted text or misallocates seconds", async () => {
    llmRuntime.generateJson.mockResolvedValue({ storyboard: storyboard([shot()]), explanation: "" });
    expect((await invoke({ action: "draft", brief: "招牌寫「早安」", durationSeconds: 5 })).error.code).toBe("storyboard_agent_failed");
    expect((await invoke({ action: "draft", brief: "開店", durationSeconds: 8 })).error.code).toBe("storyboard_agent_failed");
  });

  it("reports only the shots the agent actually changed", async () => {
    const before = storyboard([shot(), shot({ id: "s2" })]);
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot(), shot({ id: "s2", environment: "夜晚街道" })]),
      changedShotIds: ["s1", "s2"],
      explanation: "改成夜景",
    });
    const res = await invoke({ action: "revise", storyboard: before, instruction: "第 2 幕改成夜景" });
    expect(res.status).toBe("succeeded");
    expect(res.body.changedShotIds).toEqual(["s2"]);
  });

  it("splits scripts longer than one segment into chained segments", async () => {
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([scriptShot("s1", "她推開門。", 10), scriptShot("s2", "他微笑。", 10)]),
    });
    const res = await invoke({ action: "fromScript", script: "場景 1 她推開門。 場景 2 他微笑。" });
    expect(res.status).toBe("succeeded");
    expect(res.body.durationSeconds).toBe(20);
    expect(res.body.segments.map(({ shotIds, chained, mode }) => ({ shotIds, chained, mode }))).toEqual([
      { shotIds: ["s1"], chained: false, mode: "t2v" },
      { shotIds: ["s2"], chained: true, mode: "i2v" },
    ]);
  });

  it("treats an agent storyboard that cannot be segmented as an agent failure", async () => {
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot({ duration: 10 }), shot({ id: "s2", duration: 2, cut: true })]),
      changedShotIds: ["s2"],
    });
    const before = storyboard([shot({ duration: 10 }), shot({ id: "s2", duration: 2 })]);
    const res = await invoke({ action: "revise", storyboard: before, instruction: "第 2 幕換場景" });
    expect(res.error).toMatchObject({ code: "storyboard_agent_failed", message: expect.stringMatching(/無法分段/) });
  });

  it("keeps the user's characters out of the agent's control", async () => {
    const barista = {
      id: "c1",
      name: "咖啡師",
      description: "短髮",
      uploadIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      imageLabel: null,
    };
    const before = { ...storyboard([shot(), shot({ id: "s2" })]), global: { ...storyboard([]).global, characters: [barista] } };
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot({ characterIds: ["c1"] }), shot({ id: "s2" })]),
      changedShotIds: ["s1"],
    });
    const res = await invoke({ action: "revise", storyboard: before, instruction: "第 1 幕加入咖啡師", hasStartFrame: true });
    const sent = JSON.parse(llmRuntime.generateJson.mock.calls[0][0].userMessage);
    expect(sent.storyboard.global.characters[0]).not.toHaveProperty("uploadIds");
    expect(res.status).toBe("succeeded");
    expect(res.body.storyboard.global.characters).toEqual([barista]);
    expect(res.body.segments[0].compiled).toMatchObject({
      characterMode: "elements",
      elements: [{ characterId: "c1", name: "咖啡師" }],
    });
  });
});

describe("storyboard agent job failures", () => {
  it("stores an unexpected agent error as a generic failure", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    llmRuntime.generateJson.mockRejectedValue(new Error("socket hang up"));
    const res = await invoke({ action: "draft", brief: "開店", durationSeconds: 5 });
    expect(res.error).toEqual({ code: "storyboard_agent_failed", message: "分鏡 AI 暫時無法回應，請稍後重試" });
    consoleError.mockRestore();
  });

  it("rechecks model access when the job runs", async () => {
    db.query.mockResolvedValue({ rows: [{ video_enabled: false }] });
    const res = await invoke({ action: "draft", brief: "開店", durationSeconds: 5 });
    expect(res.error.code).toBe("video_disabled");
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });
});
