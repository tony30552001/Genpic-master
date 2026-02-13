const {
  BlobSASPermissions,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");

const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");

const allowedContentTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "application/octet-stream",
]);

/**
 * 根據檔名推斷 MIME type（當 contentType 不在允許清單時使用）
 */
const inferContentType = (fileName) => {
  const ext = (fileName || "").split(".").pop().toLowerCase();
  const map = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    md: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
  };
  return map[ext] || null;
};

const isValidBlobName = (name) => {
  if (!name || typeof name !== "string") return false;
  if (name.includes("..") || name.includes("\\") || name.startsWith("/")) return false;
  return name.length <= 200;
};

module.exports = async function (context, req) {
  // CORS 預檢處理
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options();
    return;
  }

  // 身份驗證
  const auth = await requireAuth(context, req);
  if (!auth) return;

  // 速率限制
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429);
    return;
  }

  const { fileName, container } = req.body || {};
  let { contentType } = req.body || {};

  if (!isValidBlobName(fileName)) {
    context.res = error("檔名不合法", "bad_request", 400);
    return;
  }

  // 如果 contentType 為空或不在允許清單，嘗試從檔名推斷
  if (!contentType || !allowedContentTypes.has(contentType)) {
    const inferred = inferContentType(fileName);
    if (inferred) {
      contentType = inferred;
    } else if (!allowedContentTypes.has(contentType)) {
      context.res = error("不支援的檔案格式", "bad_request", 400);
      return;
    }
  }

  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  const containerName = container || process.env.BLOB_CONTAINER_DEFAULT || "uploads";

  if (!account || !key) {
    context.res = error("Storage 設定缺失", "storage_config_missing", 500);
    return;
  }

  try {
    const sharedKey = new StorageSharedKeyCredential(account, key);
    const startsOn = new Date(new Date().valueOf() - 5 * 60 * 1000); // 提前 5 分鐘避免時差問題
    const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000); // 15 分鐘有效期

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: fileName,
        permissions: BlobSASPermissions.parse("crw"),
        startsOn,
        expiresOn,
        contentType,
      },
      sharedKey
    ).toString();

    const blobUrl = `https://${account}.blob.core.windows.net/${containerName}/${encodeURIComponent(
      fileName
    )}`;

    context.res = ok({
      blobUrl,
      sasToken,
      expiresAt: expiresOn.toISOString(),
      blobName: fileName
    });
  } catch (err) {
    context.res = error("生成 SAS Token 失敗: " + err.message, "internal_error", 500);
  }
};
