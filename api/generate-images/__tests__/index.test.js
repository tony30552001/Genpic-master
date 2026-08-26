import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageUploads = require("../../_shared/imageUploads");
const modelPolicy = require("../../_shared/modelPolicy");
const geminiImage = require("../../_shared/geminiImage");
const imageJobs = require("../../_shared/imageJobs");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
modelPolicy.ensureModelPolicy = vi.fn();
geminiImage.generateGeminiImage = vi.fn();
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
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: "gemini-3.1-flash-image-preview" });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(upload);
    imageUploads.downloadOwnedImage.mockResolvedValue({
      buffer: Buffer.from("reference-bytes"),
      contentType: "image/jpeg",
    });
    geminiImage.generateGeminiImage.mockResolvedValue({
      mimeType: "image/png",
      base64: "generated",
      prompt: "final prompt",
    });
  });

  it("resolves and downloads a ready image upload before generation", async () => {
    const response = await invoke({
      userScript: "create an infographic",
      referenceUploadId: IMAGE_ID,
    });

    expect(response.status).toBe(200);
    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
    });
    expect(imageUploads.downloadOwnedImage).toHaveBeenCalledWith(upload);
    expect(geminiImage.generateGeminiImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImage: {
          base64: Buffer.from("reference-bytes").toString("base64"),
          mimeType: "image/jpeg",
        },
      })
    );
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
      expect(geminiImage.generateGeminiImage).not.toHaveBeenCalled();
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
