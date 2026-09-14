import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const deckJobs = require("../../_shared/deckJobs");
const uploads = require("../../_shared/uploads");
const pptMasterClient = require("../../_shared/pptMasterClient");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
deckJobs.createDeckJob = vi.fn();
deckJobs.getDeckJobForUser = vi.fn();
deckJobs.listDeckJobEvents = vi.fn();
deckJobs.listDeckSlidePreviews = vi.fn();
uploads.getOwnedUpload = vi.fn();
pptMasterClient.isConfigured = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";

const readyUpload = (overrides = {}) => ({
  id: UPLOAD_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "document",
  original_file_name: "stored-brief.pdf",
  content_type: "application/pdf",
  size_bytes: 16,
  blob_name: `ready/${UPLOAD_ID}`,
  status: "ready",
  expires_at: "2099-08-26T00:00:00.000Z",
  ...overrides,
});

const invoke = async (body = {}, method = "POST") => {
  const context = {};
  await handler(context, { method, headers: {}, body });
  return context.res;
};

describe("deck job source upload ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    pptMasterClient.isConfigured.mockReturnValue(true);
    deckJobs.createDeckJob.mockResolvedValue({
      id: "deck-job-1",
      status: "queued",
      created_at: "2026-08-24T00:00:00.000Z",
    });
    uploads.getOwnedUpload.mockResolvedValue(readyUpload());
  });

  it("resolves a ready owned document and persists only its canonical source upload ID", async () => {
    const response = await invoke({
      topic: "",
      sourceUploadId: "123E4567-E89B-42D3-A456-426614174000",
      fileName: "caller-selected.pdf",
      slideCount: 8,
    });

    expect(response.status).toBe(202);
    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
      purpose: "document",
      status: "ready",
    });
    expect(deckJobs.createDeckJob).toHaveBeenCalledWith(
      expect.objectContaining({
        inputKind: "document",
        sourceUploadId: UPLOAD_ID,
        sourceDocumentUrl: null,
        sourceFileName: "stored-brief.pdf",
      })
    );
  });

  it.each([
    ["missing", null],
    ["foreign", readyUpload({ tenant_id: "other-tenant" })],
    ["pending", readyUpload({ status: "pending" })],
    ["wrong purpose", readyUpload({ purpose: "image" })],
    ["expired", readyUpload({ expires_at: "2020-01-01T00:00:00.000Z" })],
  ])("conceals %s source uploads and does not create a job", async (_label, upload) => {
    uploads.getOwnedUpload.mockResolvedValue(upload);

    const response = await invoke({ sourceUploadId: UPLOAD_ID });

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: "upload_not_found",
      message: "找不到可用的上傳文件",
    });
    expect(deckJobs.createDeckJob).not.toHaveBeenCalled();
  });

  it("rejects a new URL-based job without reading the URL", async () => {
    const response = await invoke({
      documentUrl: "https://attacker.example/legacy.pdf",
      fileName: "legacy.pdf",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("bad_request");
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(deckJobs.createDeckJob).not.toHaveBeenCalled();
  });

  it("rejects a request that mixes sourceUploadId and documentUrl", async () => {
    const response = await invoke({
      sourceUploadId: UPLOAD_ID,
      documentUrl: "https://attacker.example/legacy.pdf",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("bad_request");
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(deckJobs.createDeckJob).not.toHaveBeenCalled();
  });

  it("still accepts a topic-only job without any source upload", async () => {
    const response = await invoke({ topic: "生成式 AI 導入策略" });

    expect(response.status).toBe(202);
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(deckJobs.createDeckJob).toHaveBeenCalledWith(
      expect.objectContaining({
        inputKind: "topic",
        sourceUploadId: null,
        sourceDocumentUrl: null,
      })
    );
  });

  it("returns the admitted image model rather than accepting a client-selected one", async () => {
    deckJobs.createDeckJob.mockResolvedValueOnce({
      id: UPLOAD_ID, status: "queued", image_model_key: "gpt-image-2.5-flare",
    });
    const response = await invoke({ topic: "AI strategy", model: "client-selected" });
    expect(response.status).toBe(202);
    expect(response.body.model).toBe("gpt-image-2.5-flare");
    expect(deckJobs.createDeckJob.mock.calls[0][0]).not.toHaveProperty("model");
    expect(deckJobs.createDeckJob.mock.calls[0][0]).not.toHaveProperty("imageModelKey");
  });

  it.each(["gpt-image-2.5-flare", null])(
    "projects the saved model %s in status without configuration details",
    async (modelKey) => {
      deckJobs.getDeckJobForUser.mockResolvedValueOnce({
        id: UPLOAD_ID, status: "queued", image_model_key: modelKey,
        apiKey: "test-only-secret", endpoint: "private-config",
      });
      deckJobs.listDeckJobEvents.mockResolvedValueOnce([]);
      deckJobs.listDeckSlidePreviews.mockResolvedValueOnce([]);
      const context = {};
      await handler(context, { method: "GET", headers: {}, params: { id: UPLOAD_ID } });
      expect(context.res.status).toBe(200);
      if (modelKey) expect(context.res.body.model).toBe(modelKey);
      else expect(context.res.body).not.toHaveProperty("model");
      expect(context.res.body).not.toHaveProperty("apiKey");
      expect(context.res.body).not.toHaveProperty("endpoint");
    }
  );

  it("omits the model for an admitted image-free deck", async () => {
    const response = await invoke({ topic: "AI strategy", imageDensity: "none" });
    expect(response.status).toBe(202);
    expect(response.body).not.toHaveProperty("model");
  });
});
