import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const uploads = require("../uploads");
const uploadStorage = require("../uploadStorage");

uploads.getOwnedUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();

const { downloadOwnedImage, normalizeUploadId, resolveOwnedImageUpload } =
  require("../imageUploads");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const IMAGE_ID = "123e4567-e89b-42d3-a456-426614174000";
const upload = {
  id: IMAGE_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "image",
  status: "ready",
  content_type: "image/png; charset=binary",
  blob_name: `ready/${IMAGE_ID}`,
  expires_at: "2099-08-26T00:00:00.000Z",
};

describe("owner-scoped image upload resolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("canonicalizes UUIDs and rejects malformed IDs before database access", async () => {
    expect(normalizeUploadId(IMAGE_ID.toUpperCase())).toBe(IMAGE_ID);
    expect(normalizeUploadId("not-a-uuid")).toBeNull();
    await expect(
      resolveOwnedImageUpload({
        uploadId: "not-a-uuid",
        ...OWNER,
      })
    ).resolves.toBeNull();
    expect(uploads.getOwnedUpload).not.toHaveBeenCalled();
  });

  it("requires the same tenant, user, image purpose, ready status, expiry, and MIME type", async () => {
    uploads.getOwnedUpload.mockResolvedValue(upload);

    await expect(
      resolveOwnedImageUpload({
        uploadId: IMAGE_ID.toUpperCase(),
        ...OWNER,
      })
    ).resolves.toBe(upload);
    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: IMAGE_ID,
      ...OWNER,
      purpose: "image",
      status: "ready",
    });

    for (const invalid of [
      { ...upload, expires_at: "2000-01-01T00:00:00.000Z" },
      { ...upload, content_type: "application/pdf" },
      { ...upload, blob_name: `staging/${IMAGE_ID}` },
      { ...upload, user_id: "another-user" },
    ]) {
      uploads.getOwnedUpload.mockResolvedValueOnce(invalid);
      await expect(
        resolveOwnedImageUpload({ uploadId: IMAGE_ID, ...OWNER })
      ).resolves.toBeNull();
    }
  });

  it("downloads only a resolved ready upload and normalizes its MIME type", async () => {
    uploadStorage.downloadUploadBuffer.mockResolvedValue(Buffer.from("image"));

    await expect(downloadOwnedImage(upload)).resolves.toEqual({
      buffer: Buffer.from("image"),
      contentType: "image/png",
    });
    expect(uploadStorage.downloadUploadBuffer).toHaveBeenCalledWith(upload);
  });
});
