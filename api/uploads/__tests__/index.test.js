import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const uploads = require("../../_shared/uploads");
const uploadStorage = require("../../_shared/uploadStorage");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
uploads.createPendingUpload = vi.fn();
uploads.getOwnedUpload = vi.fn();
uploads.markUploadReady = vi.fn();
uploadStorage.issueUploadGrant = vi.fn();
uploadStorage.promoteUpload = vi.fn();

const handler = require("../index");

const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";
// Every expiry in this suite is expressed relative to this instant: the SAS
// grant lapses 15 minutes later and a pending upload 48 hours later. The clock
// is pinned so those fixtures cannot drift into the past as real time passes.
const NOW = new Date("2026-08-24T00:00:00.000Z");
const authUser = { sub: "provider-user-1" };
const owner = { tenantId: "tenant-1", userId: "user-1" };
const validCreateBody = {
  fileName: "quarterly-report.pdf",
  contentType: "application/pdf",
  sizeBytes: 123,
  purpose: "document",
};

const invoke = async ({
  method = "POST",
  params = {},
  body = undefined,
} = {}) => {
  const context = { bindingData: { ...params } };
  await handler(context, { method, headers: {}, params, body });
  return context.res;
};

const pendingUpload = (overrides = {}) => ({
  id: UPLOAD_ID,
  tenant_id: owner.tenantId,
  user_id: owner.userId,
  purpose: "document",
  original_file_name: "quarterly-report.pdf",
  content_type: "application/pdf",
  size_bytes: 123,
  blob_name: `staging/${UPLOAD_ID}`,
  status: "pending",
  expires_at: "2026-08-26T00:00:00.000Z",
  ...overrides,
});

describe("upload API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    auth.requireAuth.mockResolvedValue({ user: authUser });
    identity.resolveIdentity.mockResolvedValue(owner);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    uploads.createPendingUpload.mockResolvedValue(pendingUpload());
    uploadStorage.issueUploadGrant.mockReturnValue({
      blobUrl:
        `https://storage.example/uploads/staging/${UPLOAD_ID}`,
      sasToken: "sv=short-lived&sig=secret",
      expiresAt: "2026-08-24T00:15:00.000Z",
      blobName: `staging/${UPLOAD_ID}`,
    });
    uploadStorage.promoteUpload.mockResolvedValue({
      alreadyReady: false,
      blobName: `ready/${UPLOAD_ID}`,
    });
    uploads.markUploadReady.mockResolvedValue(
      pendingUpload({ status: "ready", blob_name: `ready/${UPLOAD_ID}` })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["create", {}],
    ["complete", { id: UPLOAD_ID, action: "complete" }],
  ])("requires authentication for %s", async (_operation, params) => {
    auth.requireAuth.mockImplementationOnce(async (context) => {
      context.res = {
        status: 401,
        body: { error: { code: "unauthorized", message: "sign in" } },
      };
      return null;
    });

    const response = await invoke({ params, body: validCreateBody });

    expect(response.status).toBe(401);
    expect(identity.resolveIdentity).not.toHaveBeenCalled();
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it("returns preflight before authentication", async () => {
    const response = await invoke({ method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(auth.requireAuth).not.toHaveBeenCalled();
  });

  it("applies rate limiting before identity or storage work", async () => {
    rateLimit.rateLimit.mockReturnValueOnce({ limited: true });

    const response = await invoke({ body: validCreateBody });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("rate_limited");
    expect(identity.resolveIdentity).not.toHaveBeenCalled();
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
  });

  it("does not expose an identity database failure", async () => {
    identity.resolveIdentity.mockRejectedValueOnce(
      new Error("database password and internal host")
    );

    const response = await invoke({ body: validCreateBody });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("upload_identity_failed");
    expect(JSON.stringify(response.body)).not.toContain("database password");
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
    expect(uploadStorage.issueUploadGrant).not.toHaveBeenCalled();
  });

  it.each(["container", "blobName", "path", "tenantId", "userId", "extra"])(
    "rejects the client-controlled or unexpected field %s",
    async (field) => {
      const response = await invoke({
        body: { ...validCreateBody, [field]: "client-value" },
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("invalid_upload");
      expect(uploads.createPendingUpload).not.toHaveBeenCalled();
      expect(uploadStorage.issueUploadGrant).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["an empty file name", { fileName: "   " }],
    ["a control character in the file name", { fileName: "bad\u0000.pdf" }],
    ["a file name over 255 characters", { fileName: `${"a".repeat(252)}.pdf` }],
    ["an unknown purpose", { purpose: "archive" }],
    ["zero bytes", { sizeBytes: 0 }],
    ["a negative size", { sizeBytes: -1 }],
    ["a fractional size", { sizeBytes: 1.5 }],
    ["an unsafe integer size", { sizeBytes: Number.MAX_SAFE_INTEGER + 1 }],
    ["a document over 50 MiB", { sizeBytes: 50 * 1024 * 1024 + 1 }],
    ["an image over 10 MiB", { purpose: "image", contentType: "image/png", sizeBytes: 10 * 1024 * 1024 + 1 }],
    ["an unsupported document MIME type", { contentType: "application/zip" }],
    ["an SVG image", { purpose: "image", contentType: "image/svg+xml" }],
    ["an image without a declared MIME type", { purpose: "image", contentType: "" }],
  ])("rejects %s before creating a row", async (_case, override) => {
    const response = await invoke({ body: { ...validCreateBody, ...override } });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_upload");
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
    expect(uploadStorage.issueUploadGrant).not.toHaveBeenCalled();
  });

  it.each([
    ["an omitted value", undefined],
    ["an array", ["application/pdf"]],
    ["an object", {}],
    ["a symbol", Symbol("application/pdf")],
    [
      "a coercion trap",
      { toString: () => { throw new Error("coercion secret"); } },
    ],
  ])("rejects contentType supplied as %s without throwing", async (_case, contentType) => {
    const body = { ...validCreateBody };
    if (contentType === undefined) delete body.contentType;
    else body.contentType = contentType;

    const response = await invoke({ body });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_upload");
    expect(JSON.stringify(response.body)).not.toContain("coercion secret");
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
  });

  it("rejects an inherited contentType field", async () => {
    const body = Object.assign(
      Object.create({ contentType: "application/pdf" }),
      {
        fileName: validCreateBody.fileName,
        sizeBytes: validCreateBody.sizeBytes,
        purpose: validCreateBody.purpose,
      }
    );

    const response = await invoke({ body });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_upload");
    expect(uploads.createPendingUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["empty", ""],
    ["generic binary", "application/octet-stream"],
  ])("infers a supported document MIME type when content type is %s", async (_case, contentType) => {
    await invoke({
      body: { ...validCreateBody, fileName: "REPORT.PDF", contentType },
    });

    expect(uploads.createPendingUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });

  it("normalizes an allowlisted MIME type case-insensitively", async () => {
    await invoke({
      body: { ...validCreateBody, contentType: "  APPLICATION/PDF  " },
    });

    expect(uploads.createPendingUpload).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "application/pdf" })
    );
  });

  it("creates an owner-scoped pending row with 48-hour retention and returns only the short grant", async () => {
    const response = await invoke({ body: validCreateBody });

    expect(identity.resolveIdentity).toHaveBeenCalledWith(authUser);
    expect(uploads.createPendingUpload).toHaveBeenCalledWith({
      tenantId: owner.tenantId,
      userId: owner.userId,
      purpose: "document",
      originalFileName: "quarterly-report.pdf",
      contentType: "application/pdf",
      sizeBytes: 123,
      expiresAt: new Date("2026-08-26T00:00:00.000Z"),
    });
    expect(uploadStorage.issueUploadGrant).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      contentType: "application/pdf",
    });
    expect(response).toMatchObject({
      status: 201,
      body: {
        uploadId: UPLOAD_ID,
        status: "pending",
        blobUrl: `https://storage.example/uploads/staging/${UPLOAD_ID}`,
        sasToken: "sv=short-lived&sig=secret",
        expiresAt: "2026-08-24T00:15:00.000Z",
      },
    });
    expect(Object.keys(response.body).sort()).toEqual([
      "blobUrl",
      "expiresAt",
      "sasToken",
      "status",
      "uploadId",
    ]);
  });

  it.each([
    ["database", uploads.createPendingUpload],
    ["storage grant", uploadStorage.issueUploadGrant],
  ])("does not expose a %s create failure", async (_source, dependency) => {
    dependency.mockRejectedValueOnce(new Error("server secret account-key"));

    const response = await invoke({ body: validCreateBody });

    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe("upload_create_failed");
    expect(JSON.stringify(response.body)).not.toContain("server secret");
  });

  it.each([
    ["malformed upload ID", { id: "not-a-uuid", action: "complete" }],
    ["missing action", { id: UPLOAD_ID }],
    ["unsupported action", { id: UPLOAD_ID, action: "delete" }],
  ])("rejects a %s without database or Azure access", async (_case, params) => {
    const response = await invoke({ params });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("upload_not_found");
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it("returns the common 404 before Azure access when the owner lookup misses", async () => {
    uploads.getOwnedUpload.mockResolvedValueOnce(null);

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("upload_not_found");
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["an expired status", { status: "expired" }],
    ["an elapsed pending expiry", { expires_at: "2026-08-23T23:59:59.000Z" }],
  ])("returns the common 404 before Azure access for %s", async (_case, override) => {
    uploads.getOwnedUpload.mockResolvedValueOnce(pendingUpload(override));

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("upload_not_found");
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it.each([
    ["an oversized declared document", { size_bytes: 50 * 1024 * 1024 + 1 }],
    ["a disallowed stored MIME type", { content_type: "application/zip" }],
    ["an unsupported stored purpose", { purpose: "archive" }],
  ])("rejects %s before Azure access", async (_case, override) => {
    uploads.getOwnedUpload.mockResolvedValueOnce(pendingUpload(override));

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("upload_invalid");
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it("returns an owned ready record without touching Azure", async () => {
    uploads.getOwnedUpload.mockResolvedValueOnce(
      pendingUpload({ status: "ready", blob_name: `ready/${UPLOAD_ID}` })
    );

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response).toMatchObject({
      status: 200,
      body: { uploadId: UPLOAD_ID, status: "ready" },
    });
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
    expect(uploads.markUploadReady).not.toHaveBeenCalled();
  });

  it("promotes the declared Blob before marking the owned row ready", async () => {
    uploads.getOwnedUpload.mockResolvedValueOnce(pendingUpload());

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(uploadStorage.promoteUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      expectedSizeBytes: 123,
      expectedContentType: "application/pdf",
    });
    expect(uploads.markUploadReady).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    expect(uploadStorage.promoteUpload.mock.invocationCallOrder[0]).toBeLessThan(
      uploads.markUploadReady.mock.invocationCallOrder[0]
    );
    expect(response).toMatchObject({
      status: 200,
      body: { uploadId: UPLOAD_ID, status: "ready" },
    });
  });

  it.each([
    ["a pg bigint decimal string", "123"],
    ["a JavaScript bigint", 123n],
  ])("normalizes %s before validating and promoting", async (_case, sizeBytes) => {
    uploads.getOwnedUpload.mockResolvedValueOnce(
      pendingUpload({ size_bytes: sizeBytes })
    );

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(200);
    expect(uploadStorage.promoteUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      expectedSizeBytes: 123,
      expectedContentType: "application/pdf",
    });
  });

  it.each([
    ["zero decimal", "0"],
    ["negative decimal", "-1"],
    ["fractional decimal", "1.5"],
    ["decimal with leading zero", "0123"],
    ["decimal with whitespace", " 123 "],
    ["exponent notation", "1e2"],
    ["trailing characters", "123x"],
    ["safe-integer overflow string", "9007199254740992"],
    ["safe-integer overflow bigint", 9007199254740992n],
  ])("rejects persisted size_bytes in %s form before Azure access", async (_case, sizeBytes) => {
    uploads.getOwnedUpload.mockResolvedValueOnce(
      pendingUpload({ size_bytes: sizeBytes })
    );

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("upload_invalid");
    expect(uploadStorage.promoteUpload).not.toHaveBeenCalled();
  });

  it("re-reads the same owner after a concurrent caller marks the row ready", async () => {
    uploads.getOwnedUpload
      .mockResolvedValueOnce(pendingUpload())
      .mockResolvedValueOnce(
        pendingUpload({ status: "ready", blob_name: `ready/${UPLOAD_ID}` })
      );
    uploads.markUploadReady.mockResolvedValueOnce(null);
    uploadStorage.promoteUpload.mockResolvedValueOnce({
      alreadyReady: true,
      blobName: `ready/${UPLOAD_ID}`,
    });

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uploadId: UPLOAD_ID, status: "ready" });
    expect(uploads.getOwnedUpload).toHaveBeenNthCalledWith(2, {
      uploadId: UPLOAD_ID,
      tenantId: owner.tenantId,
      userId: owner.userId,
    });
    expect(uploadStorage.promoteUpload).toHaveBeenCalledTimes(1);
  });

  it("fails safely when promotion cannot validate or copy storage", async () => {
    uploads.getOwnedUpload.mockResolvedValueOnce(pendingUpload());
    uploadStorage.promoteUpload.mockRejectedValueOnce(
      new Error("Blob size mismatch at secret-account/container")
    );

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("upload_promotion_failed");
    expect(JSON.stringify(response.body)).not.toContain("secret-account");
    expect(uploads.markUploadReady).not.toHaveBeenCalled();
  });

  it("fails safely when the ready transition cannot be reconciled", async () => {
    uploads.getOwnedUpload
      .mockResolvedValueOnce(pendingUpload())
      .mockResolvedValueOnce(pendingUpload());
    uploads.markUploadReady.mockResolvedValueOnce(null);

    const response = await invoke({ params: { id: UPLOAD_ID, action: "complete" } });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("upload_state_conflict");
  });
});

describe("upload OpenAPI contract", () => {
  it("documents a closed create request and explicit success and failure schemas", () => {
    const document = require("../../openapi");
    const operation = document.paths["/api/uploads"].post;
    const schema = operation.requestBody.content["application/json"].schema;

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["fileName", "contentType", "sizeBytes", "purpose"]);
    expect(Object.keys(schema.properties).sort()).toEqual([
      "contentType",
      "fileName",
      "purpose",
      "sizeBytes",
    ]);
    expect(operation.responses[201].content["application/json"].schema).toBeDefined();
    expect(operation.responses[400].content["application/json"].schema).toBeDefined();
    expect(operation.responses[401].content["application/json"].schema).toBeDefined();
  });

  it("documents the purpose-specific document and image byte limits", () => {
    const document = require("../../openapi");
    const schema =
      document.paths["/api/uploads"].post.requestBody.content["application/json"].schema;
    const branchFor = (purpose) =>
      schema.oneOf.find((branch) =>
        branch.properties.purpose.enum.includes(purpose)
      );

    expect(branchFor("document").properties.sizeBytes.maximum).toBe(52428800);
    expect(branchFor("image").properties.sizeBytes.maximum).toBe(10485760);
  });

  it("documents owner-scoped completion with ready and upload-not-found schemas", () => {
    const document = require("../../openapi");
    const operation = document.paths["/api/uploads/{id}/complete"].post;

    expect(operation.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "id", in: "path", required: true }),
      ])
    );
    expect(operation.responses[200].content["application/json"].schema).toBeDefined();
    expect(operation.responses[404].content["application/json"].schema).toBeDefined();
    expect(operation.responses[404].description).toContain("owned upload");
  });
});

describe("upload App Service routes", () => {
  // 這支測試會載入整個 Express app 並開一個真實 socket，在完整套件並行時遠慢於預設 5 秒。
  it("routes POST /api/uploads/:id through the stable missing-action response", async () => {
    const { app } = require("../../server");
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });

    try {
      const { port } = server.address();
      const response = await fetch(
        `http://127.0.0.1:${port}/api/uploads/${UPLOAD_ID}`,
        { method: "POST" }
      );

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: { code: "upload_not_found" },
      });
    } finally {
      await new Promise((resolve, reject) =>
        server.close((closeError) => closeError ? reject(closeError) : resolve())
      );
    }
  }, 30_000);
});
