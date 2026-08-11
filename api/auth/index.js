const { OAuth2Client } = require("google-auth-library");
const { ok, error, options, corsHeaders } = require("../_shared/http");
const { resolveIdentity } = require("../_shared/identity");
const {
  OAUTH_STATE_COOKIE_NAME,
  buildEntraAuthorizationUrl,
  buildOAuthStateCookie,
  buildClearedOAuthStateCookie,
  redeemEntraAuthorizationCode,
} = require("../_shared/entra");
const { rateLimit } = require("../_shared/rateLimit");
const session = require("../_shared/session");

let googleClient;
const getGoogleClient = () => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (!googleClientId) {
    throw new Error("Missing GOOGLE_CLIENT_ID");
  }
  if (!googleClient) {
    googleClient = new OAuth2Client(googleClientId);
  }
  return { client: googleClient, googleClientId };
};

const withCookie = (response, cookieValue) => ({
  ...response,
  headers: {
    ...(response.headers || {}),
    "Set-Cookie": cookieValue,
  },
});

const enforceAuthRateLimit = (context, req) => {
  const result = rateLimit(req, null);
  if (!result.limited) return false;

  context.res = error("登入嘗試過於頻繁", "rate_limited", 429, req);
  context.res.headers["Retry-After"] = String(
    Math.max(1, Math.ceil(result.retryAfterMs / 1000))
  );
  return true;
};

const createSessionForIdentity = async ({
  context,
  req,
  provider,
  providerSubject,
  providerUser,
}) => {
  const identity = await resolveIdentity(providerUser);
  if (!identity.isActive) {
    context.res = error("使用者帳號已停用", "user_disabled", 403, req);
    return null;
  }
  if (!identity.userId) {
    context.res = error("無法辨識使用者", "unauthorized", 401, req);
    return null;
  }

  const createdSession = await session.createSession({
    tenantId: identity.tenantId,
    userId: identity.userId,
    provider,
    providerSubject,
  });

  return {
    identity,
    createdSession,
  };
};

const handleEntraStart = async (context, req) => {
  if (enforceAuthRateLimit(context, req)) return;
  const returnTo = req.query?.returnTo;
  const { url, state } = await buildEntraAuthorizationUrl({ returnTo });
  context.res = {
    status: 302,
    headers: {
      ...corsHeaders(req),
      Location: url,
      "Set-Cookie": buildOAuthStateCookie(state),
    },
  };
};

const handleEntraCallback = async (context, req) => {
  if (enforceAuthRateLimit(context, req)) return;
  const code = req.query?.code;
  const state = req.query?.state;
  if (!code || !state) {
    context.res = withCookie(
      error("缺少 code 或 state", "bad_request", 400, req),
      buildClearedOAuthStateCookie()
    );
    return;
  }

  let authenticated;
  try {
    authenticated = await redeemEntraAuthorizationCode({
      code,
      state,
      expectedState: session.getCookieValue(req, OAUTH_STATE_COOKIE_NAME),
    });
  } catch (providerError) {
    context.res = withCookie(
      error(
        providerError.message || "Entra 身分驗證失敗",
        "unauthorized",
        401,
        req
      ),
      buildClearedOAuthStateCookie()
    );
    return;
  }
  const login = await createSessionForIdentity({
    context,
    req,
    provider: authenticated.provider,
    providerSubject: authenticated.providerSubject,
    providerUser: authenticated.user,
  });
  if (!login) {
    context.res = withCookie(
      context.res,
      buildClearedOAuthStateCookie()
    );
    return;
  }

  context.res = {
    status: 302,
    headers: {
      ...corsHeaders(req),
      Location: authenticated.returnTo,
      "Set-Cookie": [
        session.buildSessionCookie(login.createdSession.sessionToken),
        buildClearedOAuthStateCookie(),
      ],
    },
  };
};

const handleGoogleLogin = async (context, req) => {
  if (enforceAuthRateLimit(context, req)) return;
  const credential = req.body?.credential;
  if (!credential) {
    context.res = error("缺少 Google credential", "bad_request", 400, req);
    return;
  }

  const { client, googleClientId } = getGoogleClient();
  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId,
    });
  } catch (providerError) {
    context.res = error(
      providerError.message || "Google 身分驗證失敗",
      "unauthorized",
      401,
      req
    );
    return;
  }
  const payload = ticket.getPayload();
  const providerSubject = payload?.sub || null;
  const email = payload?.email || null;
  if (!providerSubject || !email) {
    context.res = error("無法解析 Google 身分", "unauthorized", 401, req);
    return;
  }

  const providerUser = {
    displayName: payload.name || email,
    name: payload.name || email,
    email,
    preferred_username: email,
    sub: providerSubject,
    authType: "google",
  };

  const login = await createSessionForIdentity({
    context,
    req,
    provider: "google",
    providerSubject,
    providerUser,
  });
  if (!login) return;

  context.res = withCookie(
    ok(
      {
        authenticated: true,
        user: {
          id: login.identity.userId,
          email: login.identity.email,
          displayName: login.identity.displayName,
          role: login.identity.role,
        },
        csrfToken: login.createdSession.csrfToken,
      },
      200,
      req
    ),
    session.buildSessionCookie(login.createdSession.sessionToken)
  );
};

const unauthenticatedSessionResponse = (req) =>
  ok({ authenticated: false }, 200, req);

const handleSessionState = async (context, req) => {
  const loaded = await session.loadSessionFromRequest(req);
  if (!loaded || !loaded.session) {
    const response = unauthenticatedSessionResponse(req);
    context.res =
      loaded?.sessionToken
        ? withCookie(response, session.buildClearedSessionCookie())
        : response;
    return;
  }

  const expiry = session.isSessionExpired(loaded.session);
  if (expiry.expired || !loaded.session.isActive) {
    await session.revokeSessionById(loaded.session.id);
    context.res = withCookie(
      unauthenticatedSessionResponse(req),
      session.buildClearedSessionCookie()
    );
    return;
  }

  const touchedSession = await session.touchSession(loaded.session);
  context.res = ok(
    {
      authenticated: true,
      user: {
        id: touchedSession.userId,
        email: touchedSession.email,
        displayName: touchedSession.displayName || touchedSession.email,
        role: touchedSession.role,
      },
      csrfToken: loaded.csrfToken,
    },
    200,
    req
  );
};

const handleLogout = async (context, req) => {
  const loaded = await session.loadSessionFromRequest(req);
  if (loaded?.session) {
    const expiry = session.isSessionExpired(loaded.session);
    if (!expiry.expired && !session.validateCsrfFromRequest(req, loaded.session.csrfTokenHash)) {
      context.res = error("CSRF 驗證失敗", "forbidden", 403, req);
      return;
    }
    await session.revokeSessionById(loaded.session.id);
  }

  context.res = withCookie(
    ok({ authenticated: false }, 200, req),
    session.buildClearedSessionCookie()
  );
};

module.exports = async function (context, req) {
  if ((req.method || "").toUpperCase() === "OPTIONS") {
    context.res = options(req);
    return;
  }

  const method = (req.method || "GET").toUpperCase();
  const routePath = (req.path || req.originalUrl || req.url || "").split("?", 1)[0];

  if (routePath === "/api/auth/entra/start" && method === "GET") {
    await handleEntraStart(context, req);
    return;
  }

  if (routePath === "/api/auth/entra/callback" && method === "GET") {
    await handleEntraCallback(context, req);
    return;
  }

  if (routePath === "/api/auth/google" && method === "POST") {
    await handleGoogleLogin(context, req);
    return;
  }

  if (routePath === "/api/auth/session" && method === "GET") {
    await handleSessionState(context, req);
    return;
  }

  if (routePath === "/api/auth/logout" && method === "POST") {
    await handleLogout(context, req);
    return;
  }

  context.res = error("Method not allowed", "method_not_allowed", 405, req);
};
