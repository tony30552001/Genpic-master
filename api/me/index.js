const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const { ensureModelPolicy } = require("../_shared/modelPolicy");

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

  const modelPolicy = await ensureModelPolicy(identity.tenantId);
  context.res = ok(
    {
      user: {
        id: identity.userId,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
      },
      modelPolicy,
    },
    200,
    req
  );
};
