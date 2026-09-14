import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageJobs = require("../../_shared/imageJobs");
const storage = require("../../_shared/blobStorage");
auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageJobs.getImageJobForUser = vi.fn();
storage.downloadGeneratedImage = vi.fn();
const handler = require("../index");
const jobId = "123e4567-e89b-42d3-a456-426614174000";
const owner = { tenantId: "tenant-1", userId: "user-1" };
const job = { id: jobId, status: "succeeded", model: "gpt-image-2.5-flare", operation: "edit", result_blob_name: "jobs/result/1.png", result_mime_type: "image/png", prompt: "internal prompt" };
const invoke = async (id = jobId) => {
  const context = { log: { error: vi.fn() } };
  await handler(context, { method: "GET", headers: {}, params: { id } });
  return context.res;
};

describe("image job status ownership and provenance", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user" } });
    identity.resolveIdentity.mockResolvedValue(owner);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    imageJobs.getImageJobForUser.mockResolvedValue(job);
    storage.downloadGeneratedImage.mockResolvedValue(Buffer.from("png"));
  });

  it("returns the persisted model, operation and result for an owned successful job", async () => {
    const response = await invoke();
    expect(imageJobs.getImageJobForUser).toHaveBeenCalledWith({ jobId, ...owner });
    expect(storage.downloadGeneratedImage).toHaveBeenCalledWith({ blobName: job.result_blob_name });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      jobId, status: "succeeded", model: job.model, operation: "edit",
      imageUrl: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
    });
    expect(response.body).not.toHaveProperty("prompt");
  });

  it.each(["foreign-user", "foreign-tenant", "missing"])("hides %s jobs and never fetches their blobs", async () => {
    imageJobs.getImageJobForUser.mockResolvedValue(null);
    const response = await invoke();
    expect(response.status).toBe(404);
    expect(imageJobs.getImageJobForUser).toHaveBeenCalledWith({ jobId, ...owner });
    expect(storage.downloadGeneratedImage).not.toHaveBeenCalled();
  });

  it.each(["queued", "processing", "failed"])("does not download a result for %s", async (status) => {
    imageJobs.getImageJobForUser.mockResolvedValue({
      ...job, status, error_code: "image_model_not_configured", error_message: "Not configured",
    });
    const response = await invoke();
    expect(response.body).toMatchObject({ jobId, status, model: job.model, operation: "edit" });
    expect(response.body).not.toHaveProperty("imageUrl");
    if (status === "failed") {
      expect(response.body.error).toEqual({ code: "image_model_not_configured", message: "Not configured" });
    }
    expect(storage.downloadGeneratedImage).not.toHaveBeenCalled();
  });

  it.each([{ tenantId: "tenant-1" }, { userId: "user-1" }])("rejects incomplete owner identity %j", async (value) => {
    identity.resolveIdentity.mockResolvedValue(value);
    expect((await invoke()).status).toBe(401);
    expect(imageJobs.getImageJobForUser).not.toHaveBeenCalled();
  });

  it("rejects invalid job IDs before querying storage", async () => {
    expect((await invoke("bad-id")).status).toBe(400);
    expect(imageJobs.getImageJobForUser).not.toHaveBeenCalled();
  });

  it("enforces polling rate limits before querying jobs", async () => {
    rateLimit.rateLimit.mockReturnValue({ limited: true });
    expect((await invoke()).status).toBe(429);
    expect(imageJobs.getImageJobForUser).not.toHaveBeenCalled();
  });
});
