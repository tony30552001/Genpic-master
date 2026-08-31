import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageUploads = require("../../_shared/imageUploads");
const modelPolicy = require("../../_shared/modelPolicy");
const gemini = require("../../_shared/gemini");
const imageJobs = require("../../_shared/imageJobs");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
modelPolicy.ensureModelPolicy = vi.fn();
gemini.getModel = vi.fn();
imageJobs.createImageJob = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const IMAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const upload = {
  id: IMAGE_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "image",
  content_type: "image/png",
  original_file_name: "source.png",
  status: "ready",
  expires_at: "2099-08-26T00:00:00.000Z",
  blob_name: `ready/${IMAGE_ID}`,
};

const invoke = async (body = {}) => {
  const log = vi.fn();
  log.error = vi.fn();
  log.warn = vi.fn();
  const context = { log };
  await handler(context, { method: "POST", headers: {}, body });
  return context.res;
};

describe("image-transform owner-scoped source uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: "gemini-3.1-flash-image-preview" });
    imageJobs.createImageJob.mockResolvedValue({
      id: "223e4567-e89b-42d3-a456-426614174000",
      status: "queued",
      model: "gpt-image-2",
      operation: "edit",
    });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(upload);
    imageUploads.downloadOwnedImage.mockResolvedValue({
      buffer: Buffer.from("source-bytes"),
      contentType: "image/png",
    });
    const generateContent = vi.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "result" } }] } }],
    });
    gemini.getModel.mockReturnValue({ generateContent });
  });

  it("resolves and downloads a ready image upload before transformation", async () => {
    const response = await invoke({
      uploadId: IMAGE_ID,
      mimeType: "image/png",
      mode: "style_transfer",
      prompt: "watercolor",
    });

    expect(response.status).toBe(200);
    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
    });
    expect(imageUploads.downloadOwnedImage).toHaveBeenCalledWith(upload);
    const model = gemini.getModel.mock.results[0].value;
    expect(model.generateContent).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ inlineData: expect.objectContaining({ data: Buffer.from("source-bytes").toString("base64") }) }),
      ]),
      expect.any(Object)
    );
  });

  it.each(["missing", "foreign", "document-purpose", "pending"]) (
    "returns upload_not_found for %s image IDs before storage or model work",
    async () => {
      imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);

      const response = await invoke({ uploadId: IMAGE_ID });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: "upload_not_found",
        message: "找不到可用的上傳圖片",
      });
      expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
      expect(gemini.getModel).not.toHaveBeenCalled();
    }
  );

  it("rejects browser-provided image bytes and URLs", async () => {
    const response = await invoke({
      imageBase64: "AAAA",
      imageUrl: "https://attacker.example/source.png",
    });

    expect(response.status).toBe(400);
    expect(imageUploads.resolveOwnedImageUpload).not.toHaveBeenCalled();
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
  });

  it("queues GPT image edits without holding the request open for provider work", async () => {
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: "gpt-image-2" });

    const response = await invoke({
      uploadId: IMAGE_ID,
      mode: "style_transfer",
      prompt: "watercolor",
      aspectRatio: "1:1",
      quality: "medium",
    });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      jobId: "223e4567-e89b-42d3-a456-426614174000",
      status: "queued",
      model: "gpt-image-2",
      prompt: expect.any(String),
    });
    expect(imageJobs.createImageJob).toHaveBeenCalledWith({
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
      model: "gpt-image-2",
      prompt: expect.any(String),
      aspectRatio: "1:1",
      imageSize: undefined,
      quality: "medium",
      operation: "edit",
      sourceUploadId: IMAGE_ID,
    });
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
  });
});
