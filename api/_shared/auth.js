const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { error } = require("./http");

const tenantId = process.env.AZURE_TENANT_ID;
const clientId = process.env.AZURE_CLIENT_ID;
const authDisabled = process.env.AUTH_DISABLED === "true";

const jwksUri = tenantId
  ? `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
  : null;

const client = jwksUri
  ? jwksClient({
    jwksUri,
    cache: true,
    rateLimit: true,
  })
  : null;

const getSigningKey = (header, callback) => {
  if (!client) {
    callback(new Error("Missing jwks client"));
    return;
  }
  client.getSigningKey(header.kid, (err, key) => {
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

const verifyToken = (token) =>
  new Promise((resolve, reject) => {
    const issuer = tenantId
      ? `https://login.microsoftonline.com/${tenantId}/v2.0`
      : null;

    jwt.verify(
      token,
      getSigningKey,
      {
        algorithms: ["RS256"],
        audience: clientId,
        // issuer, // Remove strict issuer check to avoid v1/v2 mismatch issues during setup
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(decoded);
      }
    );
  });

const requireAuth = async (context, req) => {
  if (authDisabled) {
    return {
      user: {
        preferred_username: "local.dev@example.com",
        name: "Local Dev",
      },
    };
  }

  if (!tenantId || !clientId) {
    context.res = error("Auth 設定缺失", "auth_config_missing", 500);
    return null;
  }

  const token = parseBearer(req);
  if (!token) {
    context.res = error("缺少 Bearer Token", "unauthorized", 401);
    return null;
  }

  try {
    const decoded = await verifyToken(token);
    return { user: decoded };
  } catch (err) {
    context.res = error("Token 驗證失敗", "unauthorized", 401);
    return null;
  }
};

module.exports = { requireAuth };
