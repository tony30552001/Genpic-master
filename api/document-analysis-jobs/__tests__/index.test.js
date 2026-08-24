import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const uploads = require("../../_shared/uploads");
const jobs = require("../../_shared/documentAnalysisJobs");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
uploads.getOwnedUpload = vi.fn();
jobs.createDocumentAnalysisJob = vi.fn();
jobs.getDocumentAnalysisJobForUser = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";
const JOB_ID = "223e4567-e89b-42d3-a456-426614174000";

const invoke = async ({ method = "POST", body, params = {} } = {}) => {
  const context = { res: undefined, log: { warn: vi.fn(), error: vi.fn() } };
  await handler(context, {
    method,
    body,
    params,
    headers: {},
  });
  return context.res;
};

describe("document analysis job API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { email: "owner@example.com" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    uploads.getOwnedUpload.mockResolvedValue({
      id: UPLOAD_ID,
      tenant_id: OWNER.tenantId,
      user_id: OWNER.userId,
      purpose: "document",
      status: "ready",
      expires_at: "2099-08-26T00:00:00.000Z",
    });
    jobs.createDocumentAnalysisJob.mockResolvedValue({
      id: JOB_ID,
      status: "queued",
      created_at: "2026-08-24T00:00:00.000Z",
    });
    jobs.getDocumentAnalysisJobForUser.mockResolvedValue({
      id: JOB_ID,
      status: "succeeded",
      result: { scenes: [{ scene_number: 1 }] },
    });
  });

  it("creates an owner-scoped job and returns 202 before LLM work starts", async () => {
    const response = await invoke({
      body: { uploadId: UPLOAD_ID, sceneCount: 4 },
    });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ jobId: JOB_ID, status: "queued" });
    expect(jobs.createDocumentAnalysisJob).toHaveBeenCalledWith({
      ...OWNER,
      sourceUploadId: UPLOAD_ID,
      sceneCount: 4,
    });
  });

  it("rejects a source upload that is not ready, owned, and unexpired", async () => {
    uploads.getOwnedUpload.mockResolvedValue({
      id: UPLOAD_ID,
      tenant_id: "other-tenant",
      user_id: "other-user",
      purpose: "document",
      status: "ready",
      expires_at: "2099-08-26T00:00:00.000Z",
    });

    const response = await invoke({
      body: { uploadId: UPLOAD_ID, sceneCount: "auto" },
    });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("upload_not_found");
    expect(jobs.createDocumentAnalysisJob).not.toHaveBeenCalled();
  });

  it("returns only the owner-scoped job result", async () => {
    const response = await invoke({ method: "GET", params: { id: JOB_ID } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      jobId: JOB_ID,
      status: "succeeded",
      result: { scenes: [{ scene_number: 1 }] },
    });
    expect(jobs.getDocumentAnalysisJobForUser).toHaveBeenCalledWith({
      jobId: JOB_ID,
      ...OWNER,
    });
  });
});
