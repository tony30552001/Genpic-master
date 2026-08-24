import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const imageUploads = require("../../_shared/imageUploads");
const llmModels = require("../../_shared/llmModels");
const llmRuntime = require("../../_shared/llmRuntime");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.generateJson = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const IMAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const upload = {
  id: IMAGE_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "image",
  content_type: "image/png",
  original_file_name: "reference.png",
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

describe("analyze-style owner-scoped image uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(upload);
    imageUploads.downloadOwnedImage.mockResolvedValue({
      buffer: Buffer.from("png-bytes"),
      contentType: "image/png",
    });
    llmModels.resolveRoleModel.mockResolvedValue({ model: { modelName: "style-model" } });
    llmRuntime.generateJson.mockResolvedValue({
      style_prompt: "editorial watercolor",
      style_description_zh: "清爽",
      image_content: "一張參考圖",
      suggested_tags: ["水彩"],
    });
  });

  it("resolves and downloads a ready image upload before style analysis", async () => {
    const response = await invoke({ referenceUploadId: IMAGE_ID });

    expect(response.status).toBe(200);
    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
    });
    expect(imageUploads.downloadOwnedImage).toHaveBeenCalledWith(upload);
    expect(llmRuntime.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: { mimeType: "image/png", base64: Buffer.from("png-bytes").toString("base64") },
      })
    );
  });

  it.each(["missing", "foreign", "document-purpose", "pending"]) (
    "returns upload_not_found for %s image IDs before storage or model work",
    async () => {
      imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);

      const response = await invoke({ referenceUploadId: IMAGE_ID });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: "upload_not_found",
        message: "找不到可用的上傳圖片",
      });
      expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
      expect(llmRuntime.generateJson).not.toHaveBeenCalled();
    }
  );

  it("rejects preview or URL-only input instead of accepting a caller-selected image", async () => {
    const response = await invoke({
      referencePreview: "data:image/png;base64,AAAA",
      imageUrl: "https://attacker.example/reference.png",
    });

    expect(response.status).toBe(404);
    expect(imageUploads.resolveOwnedImageUpload).not.toHaveBeenCalled();
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });
});
