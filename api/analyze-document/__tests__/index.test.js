import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const auth = require("../../_shared/auth");
const documentParser = require("../../_shared/documentParser");
const identity = require("../../_shared/identity");
const llmModels = require("../../_shared/llmModels");
const llmRuntime = require("../../_shared/llmRuntime");
const rateLimit = require("../../_shared/rateLimit");
const uploads = require("../../_shared/uploads");
const uploadStorage = require("../../_shared/uploadStorage");

auth.requireAuth = vi.fn();
documentParser.parseDocumentBuffer = vi.fn();
identity.resolveIdentity = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.generateJson = vi.fn();
rateLimit.rateLimit = vi.fn();
uploads.getOwnedUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();

const handler = require("../index");

const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";
const authUser = { sub: "provider-user-1" };
const owner = { tenantId: "tenant-1", userId: "user-1" };

const readyUpload = (overrides = {}) => ({
  id: UPLOAD_ID,
  tenant_id: owner.tenantId,
  user_id: owner.userId,
  purpose: "document",
  original_file_name: "stored-report.txt",
  content_type: "text/plain",
  size_bytes: 16,
  blob_name: `ready/${UPLOAD_ID}`,
  status: "ready",
  expires_at: "2099-08-26T00:00:00.000Z",
  ...overrides,
});

const invoke = async (body = {}, method = "POST") => {
  const log = vi.fn();
  log.warn = vi.fn();
  log.error = vi.fn();
  const context = { log };
  await handler(context, { method, headers: {}, body });
  return { response: context.res, log };
};

const successfulModelResponse = {
  title: "Stored report",
  summary: "Summary",
  recommended_style: {
    name: "Editorial",
    description: "Clear",
    prompt: "clean editorial illustration",
    tags: ["清晰"],
  },
  scenes: [{
    scene_number: 1,
    scene_title: "Opening",
    scene_description: "A clear opening scene",
    visual_prompt: "clean editorial opening",
    source_text: "Opening",
  }],
  characters: [],
};

describe("analyze-document upload ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    auth.requireAuth.mockResolvedValue({ user: authUser });
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    identity.resolveIdentity.mockResolvedValue(owner);
    uploads.getOwnedUpload.mockResolvedValue(readyUpload());
    uploadStorage.downloadUploadBuffer.mockResolvedValue(
      Buffer.from("trusted document")
    );
    documentParser.parseDocumentBuffer.mockResolvedValue({
      kind: "text",
      text: "trusted document",
      format: "txt",
      parser: "plain_text",
      mimeType: "text/plain",
    });
    llmModels.resolveRoleModel.mockResolvedValue({
      model: { provider: "azure-openai", modelName: "analysis-model" },
    });
    llmRuntime.generateJson.mockResolvedValue(successfulModelResponse);
  });

  it("looks up a ready document by canonical tenant and user before download", async () => {
    const { response } = await invoke({
      uploadId: UPLOAD_ID,
      fileName: "caller-selected.pdf",
      contentType: "application/pdf",
      sceneCount: 3,
    });

    expect(response.status).toBe(200);
    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      tenantId: "tenant-1",
      userId: "user-1",
      purpose: "document",
      status: "ready",
    });
    expect(uploadStorage.downloadUploadBuffer).toHaveBeenCalledWith(
      readyUpload()
    );
  });

  it("canonicalizes an uppercase UUID before owned lookup and row comparison", async () => {
    const { response } = await invoke({
      uploadId: "123E4567-E89B-42D3-A456-426614174000",
    });

    expect(response.status).toBe(200);
    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: "123e4567-e89b-42d3-a456-426614174000",
      tenantId: "tenant-1",
      userId: "user-1",
      purpose: "document",
      status: "ready",
    });
    expect(uploadStorage.downloadUploadBuffer).toHaveBeenCalledWith(
      readyUpload()
    );
    expect(llmRuntime.generateJson).toHaveBeenCalledTimes(1);
  });

  it("parses trusted bytes with the stored filename and content type", async () => {
    const trustedBytes = Buffer.from("trusted document");
    uploadStorage.downloadUploadBuffer.mockResolvedValueOnce(trustedBytes);

    const { response } = await invoke({
      uploadId: UPLOAD_ID,
      fileName: "caller-selected.pdf",
      contentType: "application/pdf",
    });

    expect(response.status).toBe(200);
    expect(documentParser.parseDocumentBuffer).toHaveBeenCalledWith({
      buffer: trustedBytes,
      fileName: "stored-report.txt",
      mimeType: "text/plain",
    });
  });

  it.each([
    ["missing", null],
    ["foreign owner", readyUpload({ user_id: "other-user" })],
    ["pending", readyUpload({ status: "pending" })],
    ["wrong purpose", readyUpload({ purpose: "image" })],
    ["expired", readyUpload({ expires_at: "2020-01-01T00:00:00.000Z" })],
    ["invalid expiry", readyUpload({ expires_at: "not-a-date" })],
  ])("returns the same hidden not-found response for a %s upload", async (_case, upload) => {
    uploads.getOwnedUpload.mockResolvedValueOnce(upload);

    const { response } = await invoke({ uploadId: UPLOAD_ID });

    expect(response).toEqual({
      status: 404,
      headers: expect.objectContaining({ "Content-Type": "application/json" }),
      body: {
        error: {
          code: "upload_not_found",
          message: "找不到可用的上傳文件",
        },
      },
    });
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
    expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "123e4567-e89b-42d3-a456-42661417400z"])(
    "hides malformed upload ID %s without repository or Blob access",
    async (uploadId) => {
      const { response } = await invoke({ uploadId });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: "upload_not_found",
        message: "找不到可用的上傳文件",
      });
      expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
      expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
      expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
    }
  );

  it("rejects documentUrl-only input without network or Blob access", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { response } = await invoke({
      documentUrl: "https://attacker.example/selected-document.pdf",
      fileName: "selected-document.pdf",
      contentType: "application/pdf",
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("bad_request");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
    expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
  });

  it("accepts a decoded Base64 document of exactly 80 KiB", async () => {
    const bytes = Buffer.alloc(80 * 1024, 65);

    const { response } = await invoke({
      base64Content: bytes.toString("base64"),
      fileName: "compatibility.txt",
      contentType: "text/plain",
    });

    expect(response.status).toBe(200);
    expect(documentParser.parseDocumentBuffer).toHaveBeenCalledWith({
      buffer: bytes,
      fileName: "compatibility.txt",
      mimeType: "text/plain",
    });
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
  });

  it("accepts a legal Base64 data URL", async () => {
    const bytes = Buffer.from("compatibility document");

    const { response } = await invoke({
      base64Content: `data:text/plain;base64,${bytes.toString("base64")}`,
      fileName: "compatibility.txt",
      contentType: "application/pdf",
    });

    expect(response.status).toBe(200);
    expect(documentParser.parseDocumentBuffer).toHaveBeenCalledWith({
      buffer: bytes,
      fileName: "compatibility.txt",
      mimeType: "text/plain",
    });
  });

  it.each([
    ["empty raw payload", ""],
    ["raw payload with an invalid alphabet", "QUJ@"],
    ["raw payload with incorrect padding", "QQ="],
    ["non-canonical raw payload", "AB=="],
    ["data URL without the Base64 marker", "data:text/plain,QUJD"],
    ["data URL without a MIME type", "data:;base64,QUJD"],
    ["data URL with unaccepted parameters", "data:text/plain;charset=utf-8;base64,QUJD"],
    ["empty data URL payload", "data:text/plain;base64,"],
    ["data URL payload with an invalid alphabet", "data:text/plain;base64,QUJ@"],
  ])("rejects %s before identity, parsing, or model work", async (_case, base64Content) => {
    const { response } = await invoke({
      base64Content,
      fileName: "compatibility.txt",
      contentType: "text/plain",
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "invalid_base64",
      message: "Base64 文件內容格式錯誤",
    });
    expect(identity.resolveIdentity).not.toHaveBeenCalled();
    expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
    expect(llmModels.resolveRoleModel).not.toHaveBeenCalled();
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });

  it.each([
    ["raw", "A".repeat(109229), "A".repeat(109229)],
    [
      "data URL",
      `data:text/plain;base64,${"A".repeat(109229)}`,
      "A".repeat(109229),
    ],
  ])("rejects a huge %s payload before Base64 decoding", async (_case, base64Content, payload) => {
    const bufferFrom = vi.spyOn(Buffer, "from");
    try {
      const { response } = await invoke({
        base64Content,
        fileName: "compatibility.txt",
        contentType: "text/plain",
      });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe("base64_too_large");
      expect(
        bufferFrom.mock.calls.some(([value]) => value === payload)
      ).toBe(false);
      expect(identity.resolveIdentity).not.toHaveBeenCalled();
      expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
      expect(llmModels.resolveRoleModel).not.toHaveBeenCalled();
      expect(llmRuntime.generateJson).not.toHaveBeenCalled();
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it("rejects a huge legal MIME header before decoding or processing", async () => {
    const mimeType = `application/${"a".repeat(200000)}`;
    const bufferFrom = vi.spyOn(Buffer, "from");
    try {
      const { response } = await invoke({
        base64Content: `data:${mimeType};base64,QUJD`,
        fileName: "compatibility.txt",
        contentType: "text/plain",
      });

      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe("base64_too_large");
      expect(
        bufferFrom.mock.calls.some(([value]) => value === "QUJD")
      ).toBe(false);
      expect(identity.resolveIdentity).not.toHaveBeenCalled();
      expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
      expect(llmModels.resolveRoleModel).not.toHaveBeenCalled();
      expect(llmRuntime.generateJson).not.toHaveBeenCalled();
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it("rejects an unreasonable bounded MIME header before decoding or processing", async () => {
    const mimeType = `application/${"a".repeat(300)}`;
    const bufferFrom = vi.spyOn(Buffer, "from");
    try {
      const { response } = await invoke({
        base64Content: `data:${mimeType};base64,QUJD`,
        fileName: "compatibility.txt",
        contentType: "text/plain",
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toEqual({
        code: "invalid_base64",
        message: "Base64 文件內容格式錯誤",
      });
      expect(
        bufferFrom.mock.calls.some(([value]) => value === "QUJD")
      ).toBe(false);
      expect(identity.resolveIdentity).not.toHaveBeenCalled();
      expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
      expect(llmModels.resolveRoleModel).not.toHaveBeenCalled();
      expect(llmRuntime.generateJson).not.toHaveBeenCalled();
    } finally {
      bufferFrom.mockRestore();
    }
  });

  it("rejects decoded Base64 over 80 KiB before identity, parsing, or model work", async () => {
    const bytes = Buffer.alloc(80 * 1024 + 1, 65);

    const { response } = await invoke({
      base64Content: bytes.toString("base64"),
      fileName: "compatibility.txt",
      contentType: "text/plain",
    });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("base64_too_large");
    expect(identity.resolveIdentity).not.toHaveBeenCalled();
    expect(documentParser.parseDocumentBuffer).not.toHaveBeenCalled();
    expect(llmModels.resolveRoleModel).not.toHaveBeenCalled();
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });

  it("returns a stable generic error when the upload repository fails", async () => {
    uploads.getOwnedUpload.mockRejectedValueOnce(
      new Error("database host, tenant and secret details")
    );

    const { response } = await invoke({ uploadId: UPLOAD_ID });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual({
      code: "analysis_failed",
      message: "文件分析失敗，請稍後重試",
    });
    expect(JSON.stringify(response)).not.toContain("database host");
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
  });

  it("exposes the same owner-scoped analysis runner for background jobs", async () => {
    const result = await handler.runDocumentAnalysis({
      requestBody: { uploadId: UPLOAD_ID, sceneCount: "auto" },
      owner,
      context: { log: vi.fn() },
    });

    expect(result).toEqual(expect.objectContaining({
      total_scenes: 1,
    }));
    expect(result.scenes).toEqual([
      expect.objectContaining(successfulModelResponse.scenes[0]),
    ]);
    expect(uploadStorage.downloadUploadBuffer).toHaveBeenCalledWith(readyUpload());
  });
});
