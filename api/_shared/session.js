const crypto = require("node:crypto");
const { query } = require("./db");

const SESSION_COOKIE_NAME = "pixora_session";
const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MAX_AGE_SECONDS = Math.floor(SESSION_ABSOLUTE_TIMEOUT_MS / 1000);
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

const isExplicitDevelopment =
  process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Development";
const isProductionEnvironment =
  !isExplicitDevelopment &&
  (process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Production" ||
    process.env.NODE_ENV === "production" ||
    Boolean(process.env.WEBSITE_SITE_NAME));

const getSessionSecret = () => {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 bytes");
  }
  return secret;
};

const getHeader = (req, headerName) => {
  const headers = req?.headers || {};
  const exact = headers[headerName];
  if (exact !== undefined) return exact;
  const lower = headerName.toLowerCase();
  const upper = headerName.toUpperCase();
  return headers[lower] ?? headers[upper];
};

const parseCookies = (cookieHeader) => {
  if (!cookieHeader || typeof cookieHeader !== "string") return {};
  return cookieHeader.split(";").reduce((acc, part) => {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) return acc;
    const key = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (!key) return acc;
    try {
      acc[key] = decodeURIComponent(value);
    } catch {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const getCookieValue = (req, cookieName) => {
  const cookieHeader = getHeader(req, "cookie");
  const cookies = parseCookies(cookieHeader);
  return cookies[cookieName] || null;
};

const getSessionTokenFromRequest = (req) => {
  return getCookieValue(req, SESSION_COOKIE_NAME);
};

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) {
    parts.push("HttpOnly");
  }
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
};

const buildSessionCookie = (sessionToken) =>
  serializeCookie(SESSION_COOKIE_NAME, sessionToken, {
    maxAge: SESSION_MAX_AGE_SECONDS,
    expires: new Date(Date.now() + SESSION_ABSOLUTE_TIMEOUT_MS),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isProductionEnvironment,
  });

const buildClearedSessionCookie = () =>
  serializeCookie(SESSION_COOKIE_NAME, "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: isProductionEnvironment,
  });

const randomOpaqueToken = () => crypto.randomBytes(32).toString("base64url");

const hashWithSecret = (value, purpose) =>
  crypto
    .createHmac("sha256", getSessionSecret())
    .update(`${purpose}:${value}`)
    .digest("hex");

const hashSessionToken = (token) => hashWithSecret(token, "session");
const hashCsrfToken = (token) => hashWithSecret(token, "csrf");

const deriveCsrfToken = (sessionToken) =>
  crypto
    .createHmac("sha256", getSessionSecret())
    .update(`csrf-raw:${sessionToken}`)
    .digest("base64url");

const validateCsrfToken = (csrfToken, expectedHash) => {
  if (!csrfToken || !expectedHash) return false;
  const actualHash = hashCsrfToken(csrfToken);
  const expectedBuffer = Buffer.from(expectedHash, "utf8");
  const actualBuffer = Buffer.from(actualHash, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const validateCsrfFromRequest = (req, expectedHash) => {
  const csrfToken = getHeader(req, "x-csrf-token");
  return validateCsrfToken(csrfToken, expectedHash);
};

const mapSessionRow = (row) => ({
  id: row.id,
  tenantId: row.tenant_id,
  userId: row.user_id,
  provider: row.provider,
  providerSubject: row.provider_subject,
  sessionTokenHash: row.session_token_hash,
  csrfTokenHash: row.csrf_token_hash,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  idleExpiresAt: row.idle_expires_at,
  absoluteExpiresAt: row.absolute_expires_at,
  revokedAt: row.revoked_at,
  email: row.email || null,
  displayName: row.display_name || null,
  role: row.role || null,
  isActive: row.is_active !== false,
});

const createSession = async ({ tenantId, userId, provider, providerSubject }) => {
  const sessionToken = randomOpaqueToken();
  const csrfToken = deriveCsrfToken(sessionToken);
  const now = Date.now();
  const idleExpiresAt = new Date(now + SESSION_IDLE_TIMEOUT_MS);
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_TIMEOUT_MS);

  const result = await query(
    `INSERT INTO auth_sessions (
      tenant_id,
      user_id,
      provider,
      provider_subject,
      session_token_hash,
      csrf_token_hash,
      idle_expires_at,
      absolute_expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING
      id,
      tenant_id,
      user_id,
      provider,
      provider_subject,
      session_token_hash,
      csrf_token_hash,
      created_at,
      last_seen_at,
      idle_expires_at,
      absolute_expires_at,
      revoked_at`,
    [
      tenantId,
      userId,
      provider,
      providerSubject,
      hashSessionToken(sessionToken),
      hashCsrfToken(csrfToken),
      idleExpiresAt,
      absoluteExpiresAt,
    ]
  );

  return {
    sessionToken,
    csrfToken,
    session: mapSessionRow(result.rows[0]),
  };
};

const loadSessionByToken = async (sessionToken) => {
  const result = await query(
    `SELECT
      s.id,
      s.tenant_id,
      s.user_id,
      s.provider,
      s.provider_subject,
      s.session_token_hash,
      s.csrf_token_hash,
      s.created_at,
      s.last_seen_at,
      s.idle_expires_at,
      s.absolute_expires_at,
      s.revoked_at,
      u.email,
      u.display_name,
      u.role,
      u.is_active
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.session_token_hash = $1
    LIMIT 1`,
    [hashSessionToken(sessionToken)]
  );

  if (result.rows.length === 0) return null;
  return {
    sessionToken,
    csrfToken: deriveCsrfToken(sessionToken),
    session: mapSessionRow(result.rows[0]),
  };
};

const loadSessionFromRequest = async (req) => {
  const sessionToken = getSessionTokenFromRequest(req);
  if (!sessionToken) return null;
  const loaded = await loadSessionByToken(sessionToken);
  if (!loaded) {
    return { sessionToken, session: null, csrfToken: null };
  }
  return loaded;
};

const isSessionExpired = (session, now = new Date()) => {
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (session.revokedAt) return { expired: true, reason: "revoked" };
  if (new Date(session.idleExpiresAt).getTime() <= nowMs) {
    return { expired: true, reason: "idle_timeout" };
  }
  if (new Date(session.absoluteExpiresAt).getTime() <= nowMs) {
    return { expired: true, reason: "absolute_timeout" };
  }
  return { expired: false, reason: null };
};

const touchSession = async (session) => {
  const now = Date.now();
  const lastSeenAtMs = new Date(session.lastSeenAt).getTime();
  if (Number.isFinite(lastSeenAtMs) && now - lastSeenAtMs < SESSION_TOUCH_INTERVAL_MS) {
    return session;
  }

  const nextIdleExpiry = new Date(now + SESSION_IDLE_TIMEOUT_MS);
  const updated = await query(
    `UPDATE auth_sessions
     SET last_seen_at = now(),
         idle_expires_at = $2
     WHERE id = $1 AND revoked_at IS NULL
     RETURNING last_seen_at, idle_expires_at`,
    [session.id, nextIdleExpiry]
  );

  if (updated.rows.length === 0) return session;
  return {
    ...session,
    lastSeenAt: updated.rows[0].last_seen_at,
    idleExpiresAt: updated.rows[0].idle_expires_at,
  };
};

const revokeSessionById = async (sessionId) => {
  await query(
    `UPDATE auth_sessions
     SET revoked_at = now()
     WHERE id = $1 AND revoked_at IS NULL`,
    [sessionId]
  );
};

const revokeSessionByToken = async (sessionToken) => {
  await query(
    `UPDATE auth_sessions
     SET revoked_at = now()
     WHERE session_token_hash = $1 AND revoked_at IS NULL`,
    [hashSessionToken(sessionToken)]
  );
};

const toAuthUser = (session) => {
  const displayName = session.displayName || session.email;
  return {
    displayName,
    name: displayName,
    email: session.email,
    preferred_username: session.email,
    authType: session.provider === "entra" ? "microsoft" : "google",
    sub: session.providerSubject,
    ...(session.provider === "entra" ? { oid: session.providerSubject } : {}),
  };
};

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  isProductionEnvironment,
  getCookieValue,
  getSessionTokenFromRequest,
  serializeCookie,
  buildSessionCookie,
  buildClearedSessionCookie,
  randomOpaqueToken,
  hashSessionToken,
  hashCsrfToken,
  deriveCsrfToken,
  validateCsrfToken,
  validateCsrfFromRequest,
  createSession,
  loadSessionByToken,
  loadSessionFromRequest,
  isSessionExpired,
  touchSession,
  revokeSessionById,
  revokeSessionByToken,
  toAuthUser,
};
