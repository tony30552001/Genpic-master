const { ok, error, options } = require("../_shared/http");
const { requireAuth } = require("../_shared/auth");
const { rateLimit } = require("../_shared/rateLimit");
const { resolveIdentity } = require("../_shared/identity");
const sessions = require("../_shared/videoSessions");

const methodNotAllowed = (req) => error("不支援的方法", "method_not_allowed", 405, req);

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

  const { tenantId, userId } = await resolveIdentity(auth.user);
  if (!userId || !tenantId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return;
  }
  const identity = { tenantId, userId };
  const id = req.params?.id;

  try {
    if (!id) {
      if (method === "GET") {
        context.res = ok(await sessions.listSessions({ ...identity, cursor: req.query?.cursor }), 200, req);
      } else if (method === "POST") {
        const snapshot = sessions.validateSnapshot(req.body);
        context.res = ok(await sessions.createSession({ ...identity, ...snapshot }), 201, req);
      } else {
        context.res = methodNotAllowed(req);
      }
      return;
    }

    const owner = { ...identity, sessionId: sessions.requireSessionId(id) };
    if (method === "GET") {
      context.res = ok(await sessions.getSession(owner), 200, req);
    } else if (method === "PUT") {
      context.res = ok(await sessions.saveSession(owner, sessions.validateUpdate(req.body)), 200, req);
    } else if (method === "DELETE") {
      await sessions.deleteSession(owner);
      context.res = options(req);
    } else {
      context.res = methodNotAllowed(req);
    }
  } catch (err) {
    if (err instanceof sessions.VideoSessionError) {
      context.res = error(err.message, err.code, err.status, req);
      return;
    }
    throw err;
  }
};
