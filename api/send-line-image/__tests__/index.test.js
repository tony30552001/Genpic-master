import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const db = require("../../_shared/db");
const secretCrypto = require("../../_shared/secretCrypto");
const imageUploads = require("../../_shared/imageUploads");
const uploadStorage = require("../../_shared/uploadStorage");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
secretCrypto.decrypt = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
uploadStorage.issueReadGrant = vi.fn();

const handler = require("../index");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const IMAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const upload = {
  id: IMAGE_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "image",
  status: "ready",
  content_type: "image/png",
  blob_name: `ready/${IMAGE_ID}`,
  expires_at: "2099-08-26T00:00:00.000Z",
};

const invoke = async (body = {}) => {
  const context = {};
  await handler(context, { method: "POST", headers: {}, body });
  return context.res;
};

describe("send-line-image owner-scoped sharing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue(OWNER);
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(upload);
    db.query.mockResolvedValue({
      rows: [
        {
          channel_access_token_enc: "encrypted-token",
          target_id: "Utarget",
          target_type: "user",
          is_active: true,
        },
      ],
    });
    secretCrypto.decrypt.mockReturnValue("line-token");
    uploadStorage.issueReadGrant.mockReturnValue({
      blobUrl: "https://storage.blob.core.windows.net/uploads/ready/id",
      sasToken: "sv=2026&sig=secret",
      expiresAt: "2026-08-24T03:15:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValue(""),
      })
    );
  });

  it("resolves the owned image and keeps the short read SAS inside the LINE request", async () => {
    const response = await invoke({ uploadId: IMAGE_ID, message: "請查看圖片" });

    expect(response.status).toBe(200);
    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
    });
    expect(uploadStorage.issueReadGrant).toHaveBeenCalledWith(upload);
    expect(response.body).toEqual({ track: "bot", success: true });
    expect(response.body).not.toHaveProperty("readUrl");

    const [, request] = fetch.mock.calls[0];
    const payload = JSON.parse(request.body);
    expect(payload).toEqual({
      to: "Utarget",
      messages: [
        { type: "text", text: "請查看圖片" },
        {
          type: "image",
          originalContentUrl:
            "https://storage.blob.core.windows.net/uploads/ready/id?sv=2026&sig=secret",
          previewImageUrl:
            "https://storage.blob.core.windows.net/uploads/ready/id?sv=2026&sig=secret",
        },
      ],
    });
  });

  it.each(["missing", "foreign", "document-purpose", "pending"])(
    "returns upload_not_found for %s uploads before LINE or SAS work",
    async () => {
      imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);

      const response = await invoke({ uploadId: IMAGE_ID });

      expect(response.status).toBe(404);
      expect(response.body.error).toEqual({
        code: "upload_not_found",
        message: "找不到可用的上傳圖片",
      });
      expect(uploadStorage.issueReadGrant).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it("rejects missing IDs and arbitrary caller-selected image URLs", async () => {
    await expect(invoke({})).resolves.toMatchObject({ status: 404 });
    expect(imageUploads.resolveOwnedImageUpload).not.toHaveBeenCalled();

    const response = await invoke({
      imageUrl: "https://attacker.example/image.png",
    });
    expect(response.status).toBe(400);
    expect(imageUploads.resolveOwnedImageUpload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
