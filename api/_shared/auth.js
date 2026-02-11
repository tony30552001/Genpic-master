const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { OAuth2Client } = require("google-auth-library");
const { error } = require("./http");

const tenantId = process.env.AZURE_TENANT_ID;
const microsoftClientId = process.env.AZURE_CLIENT_ID;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const authDisabled = process.env.AUTH_DISABLED === "true";

// Microsoft JWKS Client
const msJwksUri = tenantId
  ? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  : null;

const msClient = msJwksUri
  ? jwksClient({
    jwksUri: msJwksUri,
    cache: true,
    rateLimit: true,
  })
  : null;

// Google OAuth Client
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const getMsSigningKey = (header, callback) => {
  if (!msClient) {
    callback(new Error("Missing Microsoft JWKS client"));
    return;
  }
  msClient.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
};

const parseBearer = (req) => {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  return header.substring("Bearer ".length);
};

const verifyMicrosoftToken = (token) =>
  new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getMsSigningKey,
      {
        algorithms: ["RS256"],
        audience: microsoftClientId,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          displayName: decoded.name || decoded.preferred_username,
          email: decoded.preferred_username || decoded.upn,
          authType: 'microsoft'
        });
      }
    );
  });

const verifyGoogleToken = async (token) => {
  if (!googleClient) throw new Error("Google Client ID not configured on backend");
  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: googleClientId,
  });
  const payload = ticket.getPayload();
  return {
    displayName: payload.name,
    email: payload.email,
    photoURL: payload.picture,
    authType: 'google'
  };
};

const requireAuth = async (context, req) => {
  if (authDisabled) {
    return {
      user: {
        displayName: "Local Dev",
        email: "local.dev@example.com",
        authType: 'bypass'
      },
    };
  }

  const token = parseBearer(req);
  if (!token) {
    context.res = error("缺少 Bearer Token", "unauthorized", 401);
    return null;
  }

  try {
    // 預先解碼以判定發行者 (issuer)
    const decodedRaw = jwt.decode(token);
    if (!decodedRaw) throw new Error("Invalid token format");

    const iss = decodedRaw.iss || "";
    let user;

    if (iss.includes("google.com")) {
      // Google Token
      user = await verifyGoogleToken(token);
    } else if (iss.includes("microsoftonline.com") || iss.includes("sts.windows.net")) {
      // Microsoft Token
      if (!tenantId || !microsoftClientId) throw new Error("Microsoft Auth Config Missing");
      user = await verifyMicrosoftToken(token);
    } else {
      throw new Error(`Unsupported token issuer: ${iss}`);
    }

    return { user };
  } catch (err) {
    console.error("Auth Error:", err.message);
    context.res = error("Token 驗證失敗: " + err.message, "unauthorized", 401);
    return null;
  }
};

module.exports = { requireAuth };
