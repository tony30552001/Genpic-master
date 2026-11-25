const { getOwnedUpload } = require("./uploads");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Returns the caller's ready, unexpired document upload, or null. */
const resolveOwnedDocumentUpload = async ({ uploadId, tenantId, userId }) => {
  const canonicalUploadId = typeof uploadId === "string" ? uploadId.trim().toLowerCase() : "";
  if (!UUID_PATTERN.test(canonicalUploadId)) return null;
  const upload = await getOwnedUpload({
    uploadId: canonicalUploadId,
    tenantId,
    userId,
    purpose: "document",
    status: "ready",
  });
  const expiresAt = new Date(upload?.expires_at).getTime();
  if (
    !upload ||
    upload.id !== canonicalUploadId ||
    upload.tenant_id !== tenantId ||
    upload.user_id !== userId ||
    upload.purpose !== "document" ||
    upload.status !== "ready" ||
    !Number.isFinite(expiresAt) ||
    expiresAt <= Date.now()
  ) {
    return null;
  }
  return upload;
};

module.exports = { resolveOwnedDocumentUpload };
