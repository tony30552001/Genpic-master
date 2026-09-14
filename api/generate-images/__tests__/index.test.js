import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageUploads = require("../../_shared/imageUploads");
const modelPolicy = require("../../_shared/modelPolicy");
const gptImage = require("../../_shared/gptImage");
const imageJobs = require("../../_shared/imageJobs");
const { ImageModelError } = require("../../_shared/imageModelConfig");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
modelPolicy.ensureModelPolicy = vi.fn();
gptImage.editGptImage = vi.fn();
gptImage.generateGptImage = vi.fn();
imageJobs.createImageJob = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const IMAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const upload = {
  id: IMAGE_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "image",
  content_type: "image/jpeg",
  original_file_name: "reference.jpg",
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

describe("generate-images owner-scoped reference uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: "gpt-image-2" });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(upload);
    imageUploads.downloadOwnedImage.mockResolvedValue({
      buffer: Buffer.from("reference-bytes"),
      contentType: "image/jpeg",
    });
    gptImage.editGptImage.mockResolvedValue({
      imageUrl: "data:image/png;base64,generated",
    });
    imageJobs.createImageJob.mockImplementation(async ({ operation }) => ({
      id: "223e4567-e89b-42d3-a456-426614174000",
      status: "queued",
      model: "gpt-image-2.5-flare",
      operation,
    }));
  });
  afterEach(() => vi.unstubAllEnvs());

  it("queues reference generation as an owned edit without downloading or calling a provider", async () => {
    const response = await invoke({
      userScript: "create an infographic",
      referenceUploadId: IMAGE_ID,
    });

    expect(response.status).toBe(202);
    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
    });
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
    expect(gptImage.editGptImage).not.toHaveBeenCalled();
    expect(imageJobs.createImageJob).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUploadId: IMAGE_ID,
        operation: "edit",
      })
    );
    expect(response.body).toMatchObject({ operation: "edit", model: "gpt-image-2.5-flare", prompt: expect.any(String) });
  });

  it("queues a job when there is no reference image", async () => {
    const response = await invoke({ userScript: "create an infographic" });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({
      jobId: "223e4567-e89b-42d3-a456-426614174000",
      status: "queued",
      model: "gpt-image-2.5-flare",
      operation: "generate",
    });
    expect(gptImage.editGptImage).not.toHaveBeenCalled();
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    expect(imageJobs.createImageJob.mock.calls[0][0]).not.toHaveProperty("model");
  });

  it("always queues even when FUNCTIONS_WORKER_RUNTIME is present", async () => {
    vi.stubEnv("FUNCTIONS_WORKER_RUNTIME", "node");
    const response = await invoke({ userScript: "create an infographic" });
    expect(response.status).toBe(202);
    expect(gptImage.generateGptImage).not.toHaveBeenCalled();
    expect(imageJobs.createImageJob).toHaveBeenCalledOnce();
  });

  it("rejects browser-selected models", async () => {
    const response = await invoke({ userScript: "cat", model: "gpt-image-2" });
    expect(response.status).toBe(400);
    expect(imageJobs.createImageJob).not.toHaveBeenCalled();
  });

  it.each([undefined, "max", "auto", null, "", 0, false])(
    "passes quality %j unchanged to authoritative admission", async (quality) => {
      await invoke({ userScript: "cat", quality });
      expect(imageJobs.createImageJob.mock.calls[0][0].quality).toBe(quality);
    }
  );

  it.each([
    new ImageModelError("Invalid quality", "bad_request", 400),
    new ImageModelError("Not configured", "image_model_not_configured", 503),
  ])("returns typed admission status and code", async (failure) => {
    imageJobs.createImageJob.mockRejectedValue(failure);
    const response = await invoke({ userScript: "cat" });
    expect(response.status).toBe(failure.status);
    expect(response.body.error).toEqual({ code: failure.code, message: failure.message });
  });

  it("does not expose unexpected admission errors", async () => {
    imageJobs.createImageJob.mockRejectedValue(new Error("private key"));
    const response = await invoke({ userScript: "cat" });
    expect(response.status).toBe(502);
    expect(JSON.stringify(response)).not.toContain("private key");
  });

  it.each(["missing", "foreign", "document-purpose", "pending"]) (
    "returns upload_not_found for %s image IDs before storage or generation",
    async () => {
      imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);

      const response = await invoke({
        userScript: "create an infographic",
        referenceUploadId: IMAGE_ID,
      });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: "upload_not_found",
        message: "找不到可用的上傳圖片",
      });
      expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
      expect(gptImage.editGptImage).not.toHaveBeenCalled();
      expect(imageJobs.createImageJob).not.toHaveBeenCalled();
    }
  );

  it("rejects caller-selected image URLs", async () => {
    const response = await invoke({
      userScript: "create an infographic",
      imageUrl: "https://attacker.example/reference.jpg",
    });

    expect(response.status).toBe(400);
    expect(imageUploads.resolveOwnedImageUpload).not.toHaveBeenCalled();
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
  });
});
