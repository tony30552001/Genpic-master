const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");
const { listPublicImageModels } = require("../_shared/imageModels");
const { listPublicVideoModels } = require("../_shared/videoModels");
const { getRemainingQuota } = require("../_shared/videoJobs");
const { ensureVideoSettings } = require("../_shared/videoPolicy");
const { query } = require("../_shared/db");

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
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

  const identity = await resolveIdentity(auth.user);
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }

  const [modelPolicy, imageModels, userResult, videoSettings, allVideoModels] = await Promise.all([
    ensureModelPolicy(identity.tenantId),
    listPublicImageModels(identity.tenantId),
    query(
      "SELECT video_enabled FROM users WHERE id = $1 AND tenant_id = $2",
      [identity.userId, identity.tenantId]
    ),
    ensureVideoSettings(identity.tenantId),
    listPublicVideoModels(identity.tenantId),
  ]);
  const videoEnabled = Boolean(userResult.rows[0]?.video_enabled);
  const videoModels = allVideoModels.filter((model) =>
    videoSettings.allowedModels.includes(model.modelKey)
  );
  const remainingVideoQuota = videoEnabled
    ? await getRemainingQuota({ tenantId: identity.tenantId, userId: identity.userId })
    : 0;
  context.res = ok(
    {
      user: {
        id: identity.userId,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        videoEnabled,
      },
      modelPolicy,
      imageModels,
      videoModels,
      videoSettings: {
        dailyQuotaPerUser: videoSettings.dailyQuotaPerUser,
        remainingQuota: remainingVideoQuota,
      },
    },
    200,
    req
  );
};
