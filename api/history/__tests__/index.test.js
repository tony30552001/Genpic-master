import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const db = require("../../_shared/db");
const imageJobs = require("../../_shared/imageJobs");
auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
imageJobs.getImageJobForUser = vi.fn();
const handler = require("../index");
const JOB_ID = "11111111-1111-4111-8111-111111111111";
const owner = { tenantId: "tenant-1", userId: "user-1" };
const payload = { jobId: JOB_ID, imageUrl: "data:image/jpeg;base64,preview", source: "general" };
const invoke = async (body = payload) => {
  const context = {};
  await handler(context, { method: "POST", body, headers: {} });
  return context.res;
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAuth.mockResolvedValue({ user: { sub: "user" } });
  identity.resolveIdentity.mockResolvedValue(owner);
  rateLimit.rateLimit.mockReturnValue({ limited: false });
  imageJobs.getImageJobForUser.mockResolvedValue({
    id: JOB_ID, status: "succeeded", model: "gpt-image-2.5-flare",
  });
  db.query.mockResolvedValue({
    rows: [{
      id: "history-1", model: "gpt-image-2.5-flare", image_job_id: JOB_ID,
      image_url: payload.imageUrl, created_at: "2026-09-11T00:00:00Z",
    }],
  });
});

describe("job-backed image history", () => {
  it.each(["general", "document", "image-transform"])("records the successful job model for %s", async (source) => {
    const res = await invoke({ ...payload, source, model: "forged-or-new-default" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ jobId: JOB_ID, model: "gpt-image-2.5-flare" });
    expect(imageJobs.getImageJobForUser).toHaveBeenCalledWith({ jobId: JOB_ID, ...owner });
    expect(db.query.mock.calls[0][1]).toEqual([
      owner.tenantId, owner.userId, null, payload.imageUrl, null, null,
      "gpt-image-2.5-flare", null, source, JOB_ID,
    ]);
    expect(db.query.mock.calls[0][0]).not.toContain("tenant_model_settings");
  });

  it("rejects missing or malformed job IDs before database/provider access", async () => {
    expect((await invoke({ imageUrl: payload.imageUrl })).status).toBe(400);
    expect((await invoke({ ...payload, jobId: "bad" })).status).toBe(400);
    expect(imageJobs.getImageJobForUser).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("does not disclose another tenant's or user's job", async () => {
    imageJobs.getImageJobForUser.mockResolvedValue(null);
    expect((await invoke()).status).toBe(404);
    expect(db.query).not.toHaveBeenCalled();
  });

  it.each(["queued", "processing", "failed"])("rejects a %s job as history provenance", async (status) => {
    imageJobs.getImageJobForUser.mockResolvedValue({ id: JOB_ID, status });
    expect((await invoke()).status).toBe(409);
    expect(db.query).not.toHaveBeenCalled();
  });
});
