const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { getOwnedUpload } = require("../_shared/uploads");
const {
  createDocumentAnalysisJob,
  getDocumentAnalysisJobForUser,
} = require("../_shared/documentAnalysisJobs");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUsableSceneCount = (value) => {
  if (value === undefined || value === null || value === "" || value === "auto") {
    return true;
  }
  const number = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= 10;
};

const normalizeSceneCount = (value) => {
  if (value === undefined || value === null || value === "") return "auto";
  if (value === "auto") return "auto";
  return typeof value === "number" ? value : Number(value);
};

const isOwnedReadyDocument = (upload, identity, uploadId) => {
  const expiresAt = new Date(upload?.expires_at).getTime();
  return (
    upload?.id === uploadId &&
    upload.tenant_id === identity.tenantId &&
    upload.user_id === identity.userId &&
    upload.purpose === "document" &&
    upload.status === "ready" &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );
};

const getIdentity = async (context, req, auth) => {
  let identity;
  try {
    identity = await resolveIdentity(auth.user);
  } catch {
    context.res = error("無法載入使用者身分", "upload_identity_failed", 500, req);
    return null;
  }
  if (!identity?.tenantId || !identity?.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return null;
  }
  return identity;
};

const assertRateLimit = (context, req, auth) => {
  const limited = rateLimit(req, auth.user);
  if (!limited.limited) return false;
  context.res = error("請求過於頻繁，請稍後再試", "rate_limited", 429, req);
  return true;
};

const createJob = async (context, req, identity) => {
  const body = req.body || {};
  const uploadId = typeof body.uploadId === "string" ? body.uploadId.toLowerCase() : "";
  if (!UUID_PATTERN.test(uploadId) || !isUsableSceneCount(body.sceneCount)) {
    context.res = error("文件分析工作參數無效", "bad_request", 400, req);
    return;
  }

  let upload;
  try {
    upload = await getOwnedUpload({
      uploadId,
      tenantId: identity.tenantId,
      userId: identity.userId,
      purpose: "document",
      status: "ready",
    });
  } catch {
    context.res = error("無法確認上傳文件", "upload_lookup_failed", 500, req);
    return;
  }

  if (!isOwnedReadyDocument(upload, identity, uploadId)) {
    context.res = error("找不到可用的上傳文件", "upload_not_found", 404, req);
    return;
  }

  try {
    const job = await createDocumentAnalysisJob({
      tenantId: identity.tenantId,
      userId: identity.userId,
      sourceUploadId: uploadId,
      sceneCount: normalizeSceneCount(body.sceneCount),
    });
    context.res = ok({ jobId: job.id, status: job.status }, 202, req);
  } catch {
    context.res = error("無法建立文件分析工作", "analysis_job_create_failed", 500, req);
  }
};

const getJob = async (context, req, identity) => {
  const params = req.params || context.bindingData || {};
  const jobId = typeof params.id === "string" ? params.id.toLowerCase() : "";
  if (!UUID_PATTERN.test(jobId)) {
    context.res = error("文件分析工作 ID 格式無效", "bad_request", 400, req);
    return;
  }

  let job;
  try {
    job = await getDocumentAnalysisJobForUser({
      jobId,
      tenantId: identity.tenantId,
      userId: identity.userId,
    });
  } catch {
    context.res = error("無法取得文件分析工作", "analysis_job_lookup_failed", 500, req);
    return;
  }

  if (!job) {
    context.res = error("找不到文件分析工作", "not_found", 404, req);
    return;
  }

  const body = {
    jobId: job.id,
    status: job.status,
    attempts: job.attempts,
    createdAt: job.created_at,
    startedAt: job.started_at,
    completedAt: job.completed_at,
  };
  if (job.status === "succeeded") body.result = job.result || {};
  if (job.status === "failed") {
    body.error = {
      code: job.error_code || "analysis_failed",
      message: job.error_message || "文件分析失敗，請稍後重試",
    };
  }
  context.res = ok(body, 200, req);
};

module.exports = async function documentAnalysisJobs(context, req) {
  const method = String(req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const auth = await requireAuth(context, req);
  if (!auth) return;
  if (assertRateLimit(context, req, auth)) return;

  const identity = await getIdentity(context, req, auth);
  if (!identity) return;

  if (method === "POST") {
    const params = req.params || context.bindingData || {};
    if (params.id) {
      context.res = error("文件分析工作路徑無效", "not_found", 404, req);
      return;
    }
    await createJob(context, req, identity);
    return;
  }

  if (method === "GET") {
    await getJob(context, req, identity);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405, req);
};

module.exports.isOwnedReadyDocument = isOwnedReadyDocument;
