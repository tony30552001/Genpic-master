const { UPLOAD_RETENTION_MS, createPendingUpload, getOwnedUpload, markUploadReady } = require("./uploads");
const {
  buildReadyBlobName,
  downloadUploadBuffer,
  maxBytesForPurpose,
  writeReadyBlob,
} = require("./uploadStorage");

const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeUploadId = (value) =>
  typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : null;

const normalizeContentType = (value) =>
  String(value || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

const hasUsableExpiry = (upload) => {
  const expiresAt = new Date(upload?.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const resolveOwnedImageUpload = async ({ uploadId, tenantId, userId }) => {
  const canonicalUploadId = normalizeUploadId(uploadId);
  if (!canonicalUploadId || !tenantId || !userId) return null;

  const upload = await getOwnedUpload({
    uploadId: canonicalUploadId,
    tenantId,
    userId,
    purpose: "image",
    status: "ready",
  });
  const contentType = normalizeContentType(upload?.content_type);
  if (
    !upload ||
    upload.id !== canonicalUploadId ||
    upload.tenant_id !== tenantId ||
    upload.user_id !== userId ||
    upload.purpose !== "image" ||
    upload.status !== "ready" ||
    upload.blob_name !== buildReadyBlobName(canonicalUploadId) ||
    !hasUsableExpiry(upload) ||
    !IMAGE_MIME_TYPES.has(contentType)
  ) {
    return null;
  }
  return upload;
};

const downloadOwnedImage = async (upload) => {
  const buffer = await downloadUploadBuffer(upload);
  const contentType = normalizeContentType(upload?.content_type);
  return {
    buffer,
    contentType: IMAGE_MIME_TYPES.has(contentType) ? contentType : "image/png",
  };
};

/** Stores image bytes the API produced as a ready upload owned by the user. */
const createReadyImageUpload = async ({ tenantId, userId, buffer, contentType, fileName }) => {
  if (!IMAGE_MIME_TYPES.has(contentType)) throw new Error("Unsupported image content type");
  if (buffer.length > maxBytesForPurpose("image")) throw new Error("Image exceeds the upload limit");
  const pending = await createPendingUpload({
    tenantId,
    userId,
    purpose: "image",
    originalFileName: fileName,
    contentType,
    sizeBytes: buffer.length,
    expiresAt: new Date(Date.now() + UPLOAD_RETENTION_MS),
  });
  await writeReadyBlob({ uploadId: pending.id, buffer, contentType });
  const ready = await markUploadReady({ uploadId: pending.id, tenantId, userId });
  if (!ready) throw new Error("Upload state changed while storing the image");
  return ready.id;
};

module.exports = {
  createReadyImageUpload,
  downloadOwnedImage,
  normalizeUploadId,
  resolveOwnedImageUpload,
};
