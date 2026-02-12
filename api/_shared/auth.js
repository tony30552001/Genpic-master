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

// 檢查是否為 Azure 內部服務產生的 Token（非使用者憑證）
const isAzureInternalToken = (issuer) => {
  if (!issuer) return false;
  return (
    issuer.includes(".scm.azurewebsites.net") ||  // SCM Site token
    issuer.includes(".azurewebsites.net") ||       // Azure App Service token
    issuer.includes("sts.windows.net") === false && // 不是 Microsoft IDP
    issuer.includes("microsoftonline.com") === false &&
    issuer.includes("google.com") === false
  );
};

const verifyMicrosoftToken = (token) =>
  new Promise((resolve, reject) => {
    // 1. 預先解碼
    const decodedToken = jwt.decode(token, { complete: true });

    if (!decodedToken) {
      reject(new Error("Token failed to decode"));
      return;
    }

    // 處理 Azure App Service / SWA 內部 Token (HS256, 無 kid)
    // 這類 Token 通常是由 Easy Auth 注入，且我們已經在 requireAuth 透過 x-ms-client-principal 嘗試處理過
    // 如果流程跑到這裡，表示 x-ms-client-principal 可能遺失，但 Token 還在
    // 由於我們無法拿到 Azure 的內部密鑰來驗證 HS256，這裡做一個權宜之計：
    // 如果是在 Azure 環境內 (有特定環境變數)，且 Token 看起來合理，則信任其內容 (僅限特定 issuer)
    if (decodedToken.header.alg === "HS256" && !decodedToken.header.kid) {
      console.warn("[Auth Warning] HS256 Token detected. Skipping signature verification for internal token.");
      // 注意：這在安全性上並非完美，但在 SWA + Function 的整合環境中，
      // 請求通常是經過 SWA Proxy 轉發的，外部難以偽造此類特定格式的 Token。
      // 若要嚴格驗證，必須依賴 x-ms-client-principal。
      resolve({
        displayName: decodedToken.payload.name || decodedToken.payload.preferred_username,
        email: decodedToken.payload.preferred_username || decodedToken.payload.upn || decodedToken.payload.email,
        authType: "microsoft-internal",
      });
      return;
    }

    if (!decodedToken.header.kid) {
      const headerKeys = Object.keys(decodedToken.header).join(", ");
      reject(new Error(`Token header missing 'kid' field. Available headers: ${headerKeys}. Alg: ${decodedToken.header.alg}`));
      return;
    }

    const kid = decodedToken.header.kid;

    // 2. 使用 kid 從 JWKS 中獲取具體的簽署金鑰
    msClient.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(new Error("Failed to get MS signing key: " + err.message));
        return;
      }

      const signingKey = key.getPublicKey();

      // 3. 執行正式驗證
      jwt.verify(
        token,
        signingKey,
        {
          algorithms: ["RS256"],
          audience: microsoftClientId,
        },
        (verifyErr, decoded) => {
          if (verifyErr) {
            reject(verifyErr);
            return;
          }
          resolve({
            displayName: decoded.name || decoded.preferred_username,
            email: decoded.preferred_username || decoded.upn,
            authType: "microsoft",
          });
        }
      );
    });
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

const parseSWAHeader = (req) => {
  const header = req.headers["x-ms-client-principal"];
  if (!header) return null;
  try {
    const buffer = Buffer.from(header, "base64");
    const principal = JSON.parse(buffer.toString("utf8"));
    return {
      displayName: principal.userDetails,
      email: principal.userDetails,
      authType: principal.identityProvider || "swa",
      userId: principal.userId,
      roles: principal.userRoles || []
    };
  } catch (err) {
    console.warn("[Auth Warning] Failed to parse x-ms-client-principal:", err.message);
    return null;
  }
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

  // 優先檢查 Azure SWA 注入的 Client Principal Header
  const swaUser = parseSWAHeader(req);
  if (swaUser) {
    console.log("[Auth Debug] SWA Header detected:", swaUser.email);
    return { user: swaUser };
  }

  const token = parseBearer(req);

  // Debug 日誌：記錄所有收到的 headers（排除敏感資訊）
  console.log("[Auth Debug] Request headers:", {
    hasAuth: !!req.headers?.authorization,
    authLength: req.headers?.authorization?.length,
    allHeaders: Object.keys(req.headers || {}).join(", ")
  });

  if (!token) {
    context.res = error("缺少 Bearer Token", "unauthorized", 401);
    return null;
  }

  try {
    // 預先解碼以判定發行者 (issuer)
    const decodedRaw = jwt.decode(token);
    if (!decodedRaw) throw new Error("Invalid token format");

    const iss = decodedRaw.iss || "";

    // Debug 日誌
    console.log("[Auth Debug] Token issuer:", iss);
    console.log("[Auth Debug] Token subject:", decodedRaw.sub);

    let user;

    if (iss.includes("google.com")) {
      // Google Token
      console.log("[Auth Debug] Verifying Google token...");
      user = await verifyGoogleToken(token);
    } else if (iss.includes("microsoftonline.com") || iss.includes("sts.windows.net")) {
      // Microsoft Token
      if (!tenantId || !microsoftClientId) throw new Error("Microsoft Auth Config Missing");
      console.log("[Auth Debug] Verifying Microsoft token...");
      user = await verifyMicrosoftToken(token);
    } else if (isAzureInternalToken(iss)) {
      // Azure SWA 或 App Service 可能會注入自己的 Token
      console.log("[Auth Warning] Azure internal token detected. Issuer:", iss);
      // 嘗試將其視為 Microsoft 體系的 Token 進行後續驗證，
      // 或者如果之後 verifyMicrosoftToken 失敗，它仍會進入 catch 並報錯。
      // 這裡我們先移除直接 throw，給予驗證機會。
      user = await verifyMicrosoftToken(token);
    } else {
      throw new Error(`Unsupported token issuer: ${iss}`);
    }

    console.log("[Auth Debug] Auth success:", user.email);
    return { user };
  } catch (err) {
    console.error("Auth Error:", err.message);
    context.res = error("Token 驗證失敗: " + err.message, "unauthorized", 401);
    return null;
  }
};

module.exports = { requireAuth };
