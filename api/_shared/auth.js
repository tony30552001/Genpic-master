const { error } = require("./http");
const session = require("./session");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const authDisabled =
  process.env.AUTH_DISABLED === "true" && !session.isProductionEnvironment;

if (process.env.AUTH_DISABLED === "true" && session.isProductionEnvironment) {
  console.error(
    "[Auth CRITICAL] AUTH_DISABLED=true detected in production. Authentication bypass is disabled."
  );
}

const withClearedSessionCookie = (response) => ({
  ...response,
  headers: {
    ...(response.headers || {}),
    "Set-Cookie": session.buildClearedSessionCookie(),
  },
});

const requireAuth = async (context, req) => {
  if (authDisabled) {
    return {
      user: {
        displayName: "Local Dev",
        name: "Local Dev",
        email: "local.dev@example.com",
        preferred_username: "local.dev@example.com",
        authType: "bypass",
        sub: "local-dev",
        oid: "local-dev",
      },
    };
  }

  const loaded = await session.loadSessionFromRequest(req);
  if (!loaded || !loaded.session) {
    const unauthorized = error("請先登入", "unauthorized", 401, req);
    context.res =
      loaded?.sessionToken
        ? withClearedSessionCookie(unauthorized)
        : unauthorized;
    return null;
  }

  const expiry = session.isSessionExpired(loaded.session);
  if (expiry.expired || !loaded.session.isActive) {
    await session.revokeSessionById(loaded.session.id);
    context.res = withClearedSessionCookie(
      error("登入已失效，請重新登入", "unauthorized", 401, req)
    );
    return null;
  }

  const method = (req.method || "GET").toUpperCase();
  const requiresCsrf = !SAFE_METHODS.has(method);
  if (requiresCsrf && !session.validateCsrfFromRequest(req, loaded.session.csrfTokenHash)) {
    context.res = error("CSRF 驗證失敗", "forbidden", 403, req);
    return null;
  }

  const touchedSession = await session.touchSession(loaded.session);
  return {
    user: session.toAuthUser(touchedSession),
    session: touchedSession,
    sessionToken: loaded.sessionToken,
    csrfToken: loaded.csrfToken,
  };
};

module.exports = { requireAuth };
