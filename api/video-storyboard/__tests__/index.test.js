import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const db = require("../../_shared/db");
const videoModels = require("../../_shared/videoModels");
const videoPolicy = require("../../_shared/videoPolicy");
const llmRuntime = require("../../_shared/llmRuntime");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
videoModels.listPublicVideoModels = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();
llmRuntime.generateJson = vi.fn();

const jobs = require("../../_shared/videoStoryboardJobs");
jobs.queueStoryboardJob = vi.fn();
jobs.getStoryboardJobForUser = vi.fn();

const handler = require("../index");

const JOB_ID = "55555555-5555-4555-8555-555555555555";

const invoke = async (req) => {
  const context = {};
  await handler(context, { headers: {}, ...req });
  return context.res;
};
const post = (body) => invoke({ method: "POST", body: { modelKey: "kling", ...body } });

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
  jobs.queueStoryboardJob.mockResolvedValue({ jobId: JOB_ID, action: "fromScript", status: "queued" });
});

describe("video-storyboard", () => {
  it("queues agent actions instead of waiting for the analysis model", async () => {
    const res = await post({ action: "fromScript", uploadId: JOB_ID });
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ jobId: JOB_ID, action: "fromScript", status: "queued" });
    expect(jobs.queueStoryboardJob).toHaveBeenCalledWith({
      tenantId: "t", userId: "u", action: "fromScript", request: { modelKey: "kling", uploadId: JOB_ID },
    });
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });

  it("rejects unknown actions and disallowed models before queueing", async () => {
    expect((await post({ action: "splitScript" })).status).toBe(400);
    expect((await post({ action: "draft", modelKey: "veo" })).status).toBe(403);
    expect(jobs.queueStoryboardJob).not.toHaveBeenCalled();
  });

  it("inspects a storyboard synchronously", async () => {
    const res = await post({
      action: "inspect",
      storyboard: {
        title: "晨光", global: { style: "", lighting: "", constraints: [], negative: "" },
        shots: [{
          id: "s1", title: null, script: null, scriptOriginal: null, duration: 5, shotSize: "wide",
          angle: "eye-level", camera: "static", action: "推開店門", environment: "吧台",
        }],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.segments).toHaveLength(1);
    expect(jobs.queueStoryboardJob).not.toHaveBeenCalled();
  });

  it("returns only the caller's job", async () => {
    jobs.getStoryboardJobForUser.mockResolvedValueOnce({ jobId: JOB_ID, action: "draft", status: "processing" });
    const res = await invoke({ method: "GET", params: { id: JOB_ID } });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("processing");
    expect(jobs.getStoryboardJobForUser).toHaveBeenCalledWith({ jobId: JOB_ID, tenantId: "t", userId: "u" });

    jobs.getStoryboardJobForUser.mockResolvedValueOnce(null);
    expect((await invoke({ method: "GET", params: { id: JOB_ID } })).status).toBe(404);
    expect((await invoke({ method: "GET", params: { id: "nope" } })).status).toBe(400);
  });
});
