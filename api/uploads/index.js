const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { resolveIdentity } = require("../_shared/identity");
const { rateLimit } = require("../_shared/rateLimit");
const {
  createPendingUpload,
  getOwnedUpload,
  markUploadReady,
} = require("../_shared/uploads");
const {
  issueUploadGrant,
  maxBytesForPurpose,
  promoteUpload,
} = require("../_shared/uploadStorage");
const {
  SUPPORTED_MIME_TYPES,
  inferMimeType,
} = require("../_shared/documentParser");

const DATABASE_RETENTION_MS = 48 * 60 * 60 * 1000;
const MAX_FILE_NAME_LENGTH = 255;
const ALLOWED_FIELDS = new Set([
  "fileName",
  "contentType",
  "sizeBytes",
  "purpose",
]);
const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hasControlCharacters = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || (codePoint >= 127 && codePoint <= 159);
  });

const normalizeContentType = (value) =>
  String(value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

const isAllowedContentType = (purpose, contentType) =>
  purpose === "document"
    ? SUPPORTED_MIME_TYPES.has(contentType)
    : purpose === "image" && IMAGE_MIME_TYPES.has(contentType);

const parseCreateInput = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) return null;

  const fileName = typeof body.fileName === "string" ? body.fileName.trim() : "";
  if (
    !fileName ||
    fileName.length > MAX_FILE_NAME_LENGTH ||
    hasControlCharacters(fileName)
  ) {
    return null;
  }

  const purpose = body.purpose;
  const maxBytes = maxBytesForPurpose(purpose);
  if (maxBytes === null) return null;

  const sizeBytes = body.sizeBytes;
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > maxBytes
  ) {
    return null;
  }

  let contentType = normalizeContentType(body.contentType);
  if (
    purpose === "document" &&
    (!contentType || contentType === "application/octet-stream")
  ) {
    contentType = normalizeContentType(inferMimeType(fileName));
  }
  if (!isAllowedContentType(purpose, contentType)) return null;

  return { fileName, contentType, sizeBytes, purpose };
};

const isPendingUploadValid = (upload) => {
  const maxBytes = maxBytesForPurpose(upload.purpose);
  return (
    maxBytes !== null &&
    Number.isSafeInteger(upload.size_bytes) &&
    upload.size_bytes > 0 &&
    upload.size_bytes <= maxBytes &&
    isAllowedContentType(
      upload.purpose,
      normalizeContentType(upload.content_type)
    )
  );
};

const uploadNotFound = (req) =>
  error("找不到上傳資料", "upload_not_found", 404, req);

const readyResponse = (uploadId, req) =>
  ok({ uploadId, status: "ready" }, 200, req);

const handleCreate = async (context, req, identity) => {
  const input = parseCreateInput(req.body);
  if (!input) {
    context.res = error("上傳資料格式無效", "invalid_upload", 400, req);
    return;
  }

  try {
    const upload = await createPendingUpload({
      tenantId: identity.tenantId,
      userId: identity.userId,
      purpose: input.purpose,
      originalFileName: input.fileName,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresAt: new Date(Date.now() + DATABASE_RETENTION_MS),
    });
    const grant = await issueUploadGrant({
      uploadId: upload.id,
      contentType: input.contentType,
    });

    context.res = ok(
      {
        uploadId: upload.id,
        status: "pending",
        blobUrl: grant.blobUrl,
        sasToken: grant.sasToken,
        expiresAt: grant.expiresAt,
      },
      201,
      req
    );
  } catch {
    context.res = error(
      "無法建立上傳資料",
      "upload_create_failed",
      500,
      req
    );
  }
};

const loadOwnedUpload = (uploadId, identity) =>
  getOwnedUpload({
    uploadId,
    tenantId: identity.tenantId,
    userId: identity.userId,
  });

const handleComplete = async (context, req, identity, uploadId) => {
  let upload;
  try {
    upload = await loadOwnedUpload(uploadId, identity);
  } catch {
    context.res = error(
      "無法完成上傳",
      "upload_completion_failed",
      500,
      req
    );
    return;
  }

  if (!upload || !["pending", "ready"].includes(upload.status)) {
    context.res = uploadNotFound(req);
    return;
  }
  if (upload.status === "ready") {
    context.res = readyResponse(uploadId, req);
    return;
  }

  const expiresAt = new Date(upload.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    context.res = uploadNotFound(req);
    return;
  }
  if (!isPendingUploadValid(upload)) {
    context.res = error("上傳資料無效", "upload_invalid", 422, req);
    return;
  }

  try {
    await promoteUpload({
      uploadId,
      expectedSizeBytes: upload.size_bytes,
      expectedContentType: normalizeContentType(upload.content_type),
    });
  } catch {
    context.res = error(
      "無法驗證或搬移上傳檔案",
      "upload_promotion_failed",
      502,
      req
    );
    return;
  }

  try {
    const ready = await markUploadReady({
      uploadId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
    if (ready?.status === "ready") {
      context.res = readyResponse(uploadId, req);
      return;
    }

    const reconciled = await loadOwnedUpload(uploadId, identity);
    if (reconciled?.status === "ready") {
      context.res = readyResponse(uploadId, req);
      return;
    }

    context.res = error(
      "上傳狀態已變更",
      "upload_state_conflict",
      409,
      req
    );
  } catch {
    context.res = error(
      "無法完成上傳",
      "upload_completion_failed",
      500,
      req
    );
  }
};

module.exports = async function (context, req) {
  const method = String(req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;

  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error(
      "請求過於頻繁，請稍後再試",
      "rate_limited",
      429,
      req
    );
    return;
  }

  let owner;
  try {
    owner = await resolveIdentity(auth.user);
  } catch {
    context.res = error(
      "無法載入使用者身分",
      "upload_identity_failed",
      500,
      req
    );
    return;
  }
  if (!owner.tenantId || !owner.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }

  if (method !== "POST") {
    context.res = uploadNotFound(req);
    return;
  }

  const params = req.params || context.bindingData || {};
  const rawUploadId = params.id;
  const action = params.action;
  if (rawUploadId == null && action == null) {
    await handleCreate(context, req, owner);
    return;
  }

  if (
    typeof rawUploadId !== "string" ||
    !UUID_PATTERN.test(rawUploadId) ||
    action !== "complete"
  ) {
    context.res = uploadNotFound(req);
    return;
  }

  await handleComplete(context, req, owner, rawUploadId.toLowerCase());
};
