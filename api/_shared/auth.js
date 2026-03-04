const jwt = require("jsonwebtoken");
const jwksClient = require("jwks-rsa");
const { OAuth2Client } = require("google-auth-library");
const { error } = require("./http");

const tenantId = process.env.AZURE_TENANT_ID;
const microsoftClientId = process.env.AZURE_CLIENT_ID;
const googleClientId = process.env.GOOGLE_CLIENT_ID;

// 判斷是否為生產環境（Azure Functions 生產環境會自動注入 WEBSITE_SITE_NAME）
const isProduction =
  process.env.AZURE_FUNCTIONS_ENVIRONMENT === "Production" ||
  process.env.NODE_ENV === "production" ||
  !!process.env.WEBSITE_SITE_NAME;

// 生產環境中強制忽略 AUTH_DISABLED，防止配置錯誤導致旁路
const authDisabled = process.env.AUTH_DISABLED === "true" && !isProduction;

if (process.env.AUTH_DISABLED === "true" && isProduction) {
  console.error("[Auth CRITICAL] AUTH_DISABLED=true detected in production environment! Ignoring — authentication will be enforced.");
}

// debug 日誌開關（需明確設定 AUTH_DEBUG=true 才會輸出敏感 debug 訊息）
const isDebug = process.env.AUTH_DEBUG === "true";

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



const parseBearer = (req) => {
  // 優先使用自訂 header（避免 Azure SWA 攔截標準 Authorization header）
  const customToken = req.headers?.['x-auth-token'] || req.headers?.['X-Auth-Token'];
  if (customToken) return customToken;

  // Fallback: 標準 Authorization header
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

    // 安全修復 #3: HS256 Token 若無 kid（無法驗證簽章），一律拒絕。
    // 攻擊者可手工偽造任意 HS256 JWT，若不驗證簽章則身份完全不可信。
    // Azure SWA/Easy Auth 的正確身份來源是 x-ms-client-principal header（已在 requireAuth 優先處理），
    // 若流程到達此處表示 SWA header 不存在，應直接拒絕而非信任未驗證的 Token payload。
    if (decodedToken.header.alg === "HS256" && !decodedToken.header.kid) {
      reject(new Error(
        "HS256 tokens without a verifiable signing key are not accepted. " +
        "Please authenticate via a supported identity provider (Microsoft Entra ID or Google) " +
        "or ensure the x-ms-client-principal header is present for Azure SWA requests."
      ));
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
      email: principal.userDetails, // SWA 通常將 email 放在 userDetails
      userDetails: principal.userDetails,
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

  // Debug 日誌：僅在 AUTH_DEBUG=true 時輸出（防止 header 資訊洩漏至日誌系統）
  if (isDebug) {
    console.log("[Auth Debug] Request headers:", {
      hasAuth: !!req.headers?.authorization,
      hasCustomToken: !!req.headers?.["x-auth-token"],
      hasSwaHeader: !!req.headers?.["x-ms-client-principal"],
    });
  }

  if (!token) {
    context.res = error("缺少 Bearer Token", "unauthorized", 401);
    return null;
  }

  try {
    // 預先解碼以判定發行者 (issuer)
    const decodedRaw = jwt.decode(token);
    if (!decodedRaw) throw new Error("Invalid token format");

    const iss = decodedRaw.iss || "";

    // Debug 日誌（僅 AUTH_DEBUG=true 時輸出，防止 issuer/subject PII 洩漏）
    if (isDebug) {
      console.log("[Auth Debug] Token issuer:", iss);
      console.log("[Auth Debug] Token subject (truncated):", decodedRaw.sub?.substring(0, 8) + "...");
    }

    let user;

    if (iss.includes("google.com")) {
      // Google Token — 使用 google-auth-library 做完整簽章驗證
      if (isDebug) console.log("[Auth Debug] Routing to Google verifier...");
      user = await verifyGoogleToken(token);
    } else if (iss.includes("microsoftonline.com") || iss.includes("sts.windows.net")) {
      // Microsoft Token — 使用 JWKS 做 RS256 簽章驗證
      if (!tenantId || !microsoftClientId) throw new Error("Microsoft Auth Config Missing");
      if (isDebug) console.log("[Auth Debug] Routing to Microsoft verifier...");
      user = await verifyMicrosoftToken(token);
    } else if (isAzureInternalToken(iss)) {
      // Azure SWA 或 App Service 可能會注入自己的 Token
      console.log("[Auth Warning] Azure internal token detected. Issuer:", iss);
      // Azure 內部 Token：嘗試 Microsoft RS256 驗證流程
      if (isDebug) console.log("[Auth Debug] Routing Azure internal token to Microsoft verifier...");
      user = await verifyMicrosoftToken(token);
    } else {
      throw new Error(`Unsupported token issuer: ${iss}`);
    }

    if (isDebug) console.log("[Auth Debug] Auth success for user type:", user.authType);
    return { user };
  } catch (err) {
    // 記錄完整錯誤供日誌系統追蹤，但不回傳 err.message 給客戶端（防止資訊洩漏）
    console.error("[Auth] Token verification failed:", err.message);
    context.res = error("身份驗證失敗，請重新登入", "unauthorized", 401);
    return null;
  }
};

module.exports = { requireAuth };
