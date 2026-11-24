import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const db = require("../../_shared/db");
const llmModels = require("../../_shared/llmModels");
const llmRuntime = require("../../_shared/llmRuntime");
const videoModels = require("../../_shared/videoModels");
const videoPolicy = require("../../_shared/videoPolicy");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.generateJson = vi.fn();
videoModels.listPublicVideoModels = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();

const handler = require("../index");

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

const invoke = async (body) => {
  const context = { log: { error: vi.fn() } };
  await handler(context, { method: "POST", headers: {}, body: { modelKey: "kling", ...body } });
  return context.res;
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

describe("video-storyboard", () => {
  it("returns a drafted storyboard with its compiled request and warnings", async () => {
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot(), shot({ id: "s2", camera: "static", action: "鏡頭推近「早安」招牌" })]),
      explanation: "假設清晨",
      questions: [],
    });
    const res = await invoke({ action: "draft", brief: "咖啡廳開店，招牌寫「早安」", durationSeconds: 10 });
    expect(res.status).toBe(200);
    expect(res.body.compiled.sendMode).toBe("multi");
    expect(res.body.warnings).toEqual([expect.objectContaining({ shotId: "s2", code: "camera_conflict" })]);
  });

  it("fails when the agent drops quoted text or misallocates seconds", async () => {
    llmRuntime.generateJson.mockResolvedValue({ storyboard: storyboard([shot()]), explanation: "" });
    expect((await invoke({ action: "draft", brief: "招牌寫「早安」", durationSeconds: 5 })).status).toBe(502);
    expect((await invoke({ action: "draft", brief: "開店", durationSeconds: 8 })).status).toBe(502);
  });

  it("reports only the shots the agent actually changed", async () => {
    const before = storyboard([shot(), shot({ id: "s2" })]);
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([shot(), shot({ id: "s2", environment: "夜晚街道" })]),
      changedShotIds: ["s1", "s2"],
      explanation: "改成夜景",
    });
    const res = await invoke({ action: "revise", storyboard: before, instruction: "第 2 幕改成夜景" });
    expect(res.status).toBe(200);
    expect(res.body.changedShotIds).toEqual(["s2"]);
  });

  it("rejects scripts longer than a single video", async () => {
    llmRuntime.generateJson.mockResolvedValue({
      storyboard: storyboard([scriptShot("s1", "她推開門。", 10), scriptShot("s2", "他微笑。", 10)]),
    });
    const res = await invoke({ action: "fromScript", script: "場景 1 她推開門。 場景 2 他微笑。" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/20 秒/);
  });
});
