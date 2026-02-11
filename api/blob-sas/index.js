// Debug: Log module loading
try {
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
  ]);

  const isValidBlobName = (name) => {
    if (!name || typeof name !== "string") return false;
    if (name.includes("..") || name.includes("\\") || name.startsWith("/")) return false;
    return name.length <= 200;
  };

  module.exports = async function (context, req) {
    if ((req.method || "").toUpperCase() === "OPTIONS") {
      context.res = options();
      return;
    }

    const auth = await requireAuth(context, req);
    if (!auth) return;

    const limited = rateLimit(req, auth.user);
    if (limited.limited) {
      context.res = error("請求過於頻繁", "rate_limited", 429);
      return;
    }

    const { fileName, contentType, container } = req.body || {};
    if (!isValidBlobName(fileName)) {
      context.res = error("檔名不合法", "bad_request", 400);
      return;
    }

    if (!allowedContentTypes.has(contentType)) {
      context.res = error("不支援的檔案格式", "bad_request", 400);
      return;
    }

    const account = process.env.AZURE_STORAGE_ACCOUNT;
    const key = process.env.AZURE_STORAGE_KEY;
    const containerName = container || process.env.BLOB_CONTAINER_DEFAULT || "uploads";

    if (!account || !key) {
      context.res = error("Storage 設定缺失", "storage_config_missing", 500);
      return;
    }

    const sharedKey = new StorageSharedKeyCredential(account, key);
    const startsOn = new Date(new Date().valueOf() - 5 * 60 * 1000);
    const expiresOn = new Date(startsOn.getTime() + 15 * 60 * 1000);

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
    });
  };
} catch (err) {
  // If module loading fails, export a handler that returns the error
  module.exports = async function (context) {
    context.res = {
      status: 500,
      body: { error: "Module load error: " + err.message },
    };
  };
}
