const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { LlmConfigurationError } = require("../_shared/llmModels");
const { VideoModelError } = require("../_shared/videoModelFamilies");
const {
  AGENT_ACTIONS,
  inspect,
  loadAllowedModel,
  requireString,
} = require("../_shared/videoStoryboardAgent");
const { getStoryboardJobForUser, queueStoryboardJob } = require("../_shared/videoStoryboardJobs");

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const getJob = async ({ identity, req }) => {
  const jobId = req.params?.id;
  if (!UUID_PATTERN.test(jobId || "")) return error("job id 格式無效", "bad_request", 400, req);
  const job = await getStoryboardJobForUser({ jobId, tenantId: identity.tenantId, userId: identity.userId });
  return job ? ok(job, 200, req) : error("找不到分鏡工作", "not_found", 404, req);
};

// inspect is deterministic and answers at once; agent actions are queued
// because one analysis-model call can outlast the 45-second request limit.
const postAction = async ({ identity, req }) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = body.action || "";
  if (action !== "inspect" && !Object.hasOwn(AGENT_ACTIONS, action)) {
    return error("不支援的分鏡動作", "bad_request", 400, req);
  }
  const model = await loadAllowedModel(identity, requireString(body.modelKey, "影片模型", 128));
  if (action === "inspect") return ok(await inspect({ body, model }), 200, req);
  const { action: _action, ...request } = body;
  const job = await queueStoryboardJob({
    tenantId: identity.tenantId,
    userId: identity.userId,
    action,
    request,
  });
  return ok(job, 202, req);
};

module.exports = async function (context, req) {
  const method = (req.method || "").toUpperCase();
  if (method === "OPTIONS") {
    context.res = options(req);
    return;
  }
  const auth = await requireAuth(context, req);
  if (!auth) return;
  const limited = rateLimit(req, auth.user);
  if (limited.limited) {
    context.res = error("請求過於頻繁", "rate_limited", 429, req);
    return;
  }
  try {
    const identity = await resolveIdentity(auth.user);
    if (!identity.userId || !identity.tenantId) {
      context.res = error("無法辨識使用者", "unauthorized", 401, req);
      return;
    }
    context.res = method === "GET"
      ? await getJob({ identity, req })
      : await postAction({ identity, req });
  } catch (caught) {
    if (caught instanceof VideoModelError || caught instanceof LlmConfigurationError) {
      context.res = error(caught.message, caught.code, caught.status, req);
      return;
    }
    throw caught;
  }
};
