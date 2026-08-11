const crypto = require("node:crypto");
const { ConfidentialClientApplication } = require("@azure/msal-node");
const session = require("./session");

const ENTRA_SCOPES = ["openid", "profile", "email"];
const STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_COOKIE_NAME = "pixora_oauth_state";

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
};

const getSessionSecret = () => {
  const secret = getRequiredEnv("AUTH_SESSION_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SESSION_SECRET must be at least 32 bytes");
  }
  return secret;
};

let msalClient;
const getMsalClient = () => {
  if (msalClient) return msalClient;

  const tenantId = getRequiredEnv("AZURE_TENANT_ID");
  const clientId = getRequiredEnv("AZURE_CLIENT_ID");
  const clientSecret = getRequiredEnv("AZURE_CLIENT_SECRET");

  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });
  return msalClient;
};

const normalizeReturnTo = (returnTo) => {
  if (typeof returnTo !== "string") return "/";
  if (!returnTo.startsWith("/") || returnTo.startsWith("//")) return "/";
  if (returnTo.startsWith("/api/")) return "/";
  return returnTo;
};

const signStatePayload = (payloadBase64) =>
  crypto
    .createHmac("sha256", getSessionSecret())
    .update(payloadBase64)
    .digest("base64url");

const buildOAuthStateCookie = (state) =>
  session.serializeCookie(OAUTH_STATE_COOKIE_NAME, state, {
    maxAge: Math.floor(STATE_TTL_MS / 1000),
    expires: new Date(Date.now() + STATE_TTL_MS),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: session.isProductionEnvironment,
  });

const buildClearedOAuthStateCookie = () =>
  session.serializeCookie(OAUTH_STATE_COOKIE_NAME, "", {
    maxAge: 0,
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: session.isProductionEnvironment,
  });

const buildState = (returnTo) => {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payloadBase64 = Buffer.from(
    JSON.stringify({
      nonce,
      returnTo: normalizeReturnTo(returnTo),
      iat: Date.now(),
    }),
    "utf8"
  ).toString("base64url");

  return {
    nonce,
    state: `${payloadBase64}.${signStatePayload(payloadBase64)}`,
  };
};

const parseState = (state) => {
  if (typeof state !== "string" || !state.includes(".")) {
    throw new Error("Invalid state");
  }
  const [payloadBase64, signature] = state.split(".", 2);
  const expectedSignature = signStatePayload(payloadBase64);
  const actualBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new Error("Invalid state signature");
  }

  const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
  const issuedAt = Number(payload.iat);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > STATE_TTL_MS) {
    throw new Error("State expired");
  }
  if (typeof payload.nonce !== "string" || payload.nonce.length === 0) {
    throw new Error("Invalid state nonce");
  }

  return {
    nonce: payload.nonce,
    returnTo: normalizeReturnTo(payload.returnTo),
  };
};

const buildEntraAuthorizationUrl = async ({ returnTo }) => {
  const redirectUri = getRequiredEnv("ENTRA_REDIRECT_URI");
  const client = getMsalClient();
  const { nonce, state } = buildState(returnTo);
  const url = await client.getAuthCodeUrl({
    redirectUri,
    scopes: ENTRA_SCOPES,
    state,
    nonce,
    responseMode: "query",
    prompt: "select_account",
  });
  return { url, state };
};

const redeemEntraAuthorizationCode = async ({ code, state, expectedState }) => {
  const redirectUri = getRequiredEnv("ENTRA_REDIRECT_URI");
  const client = getMsalClient();
  if (!expectedState) {
    throw new Error("Missing state cookie");
  }
  const actualStateBuffer = Buffer.from(state || "", "utf8");
  const expectedStateBuffer = Buffer.from(expectedState, "utf8");
  if (
    actualStateBuffer.length !== expectedStateBuffer.length ||
    !crypto.timingSafeEqual(actualStateBuffer, expectedStateBuffer)
  ) {
    throw new Error("Invalid state cookie");
  }
  const parsedState = parseState(state);

  const tokenResponse = await client.acquireTokenByCode({
    code,
    redirectUri,
    scopes: ENTRA_SCOPES,
  });

  const claims = tokenResponse.idTokenClaims || {};
  if (claims.nonce !== parsedState.nonce) {
    throw new Error("Invalid Entra nonce");
  }
  const providerSubject =
    claims.oid || claims.sub || tokenResponse.account?.homeAccountId || null;
  const email =
    claims.preferred_username ||
    claims.email ||
    claims.upn ||
    tokenResponse.account?.username ||
    null;
  const displayName = claims.name || tokenResponse.account?.name || email;

  if (!providerSubject || !email) {
    throw new Error("Unable to resolve Entra account identity");
  }

  return {
    returnTo: parsedState.returnTo,
    provider: "entra",
    providerSubject,
    user: {
      displayName,
      name: displayName,
      email,
      preferred_username: email,
      oid: claims.oid || providerSubject,
      sub: claims.sub || providerSubject,
      authType: "microsoft",
    },
  };
};

module.exports = {
  OAUTH_STATE_COOKIE_NAME,
  buildEntraAuthorizationUrl,
  buildOAuthStateCookie,
  buildClearedOAuthStateCookie,
  redeemEntraAuthorizationCode,
  normalizeReturnTo,
};
