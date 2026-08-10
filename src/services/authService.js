import { jwtDecode } from "jwt-decode";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { loginRequest, msalInstance } from "./msalClient";
import { MSAL_REDIRECT_URI } from "../config";

// 提前 5 分鐘判定 Token 過期，避免在請求途中過期
const TOKEN_EXPIRY_BUFFER_SECONDS = 5 * 60;
const INTERACTION_REQUIRED_ERROR_CODES = new Set([
  "interaction_required",
  "login_required",
  "consent_required",
  "account_selection_required",
  "no_tokens_found",
  "refresh_token_expired",
  "bad_token",
]);

let microsoftTokenRequest = null;
let microsoftRedirectInProgress = false;

/**
 * 檢查 Google Token 是否仍在有效期內
 * @param {string} token - JWT token
 * @returns {boolean} - true = 仍有效
 */
const isGoogleTokenValid = (token) => {
  try {
    const decoded = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    // 提前 5 分鐘判定過期
    return decoded.exp > currentTime + TOKEN_EXPIRY_BUFFER_SECONDS;
  } catch {
    return false;
  }
};

// 從 AuthContext 外部獲取 Google User Token 的後路方法
const getGoogleToken = () => {
  try {
    const savedUser = localStorage.getItem('google_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      const token = user.idToken;
      if (!token) return null;

      // 檢查 token 是否已過期或即將過期
      if (!isGoogleTokenValid(token)) {
        console.warn('[Auth] Google Token 已過期或即將過期，清除登入狀態');
        localStorage.removeItem('google_user');
        return null;
      }

      return token;
    }
  } catch {
    return null;
  }
  return null;
};

export const getActiveAccount = () => {
  const active = msalInstance.getActiveAccount();
  if (active) return active;

  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    msalInstance.setActiveAccount(accounts[0]);
    return accounts[0];
  }

  return null;
};

export const loginWithMicrosoft = async () => {
  // 改用 Redirect 模式以避免 Popup 被攔截或 Opener 丟失的問題
  await msalInstance.loginRedirect({
    ...loginRequest,
    redirectStartPage: window.location.href,
  });
  // Redirect 模式下，登入成功後的處理會由 handleRedirectPromise 在頁面重新載入後完成
  // 因此這裡不需要回傳 result
};

export const logout = async () => {
  const account = getActiveAccount();
  if (!account) return;
  // 改用 Redirect 模式登出
  await msalInstance.logoutRedirect({ account });
};

const isMicrosoftTokenFresh = (token) => {
  try {
    const decoded = jwtDecode(token);
    return Number.isFinite(decoded.exp) &&
      decoded.exp > Date.now() / 1000 + TOKEN_EXPIRY_BUFFER_SECONDS;
  } catch {
    return false;
  }
};

const isInteractionRequiredError = (error) =>
  error instanceof InteractionRequiredAuthError ||
  INTERACTION_REQUIRED_ERROR_CODES.has(error?.errorCode) ||
  INTERACTION_REQUIRED_ERROR_CODES.has(error?.code);

const acquireMicrosoftTokenSilently = async (account, forceRefresh) => {
  const request = {
    ...loginRequest,
    account,
    forceRefresh,
    redirectUri: MSAL_REDIRECT_URI,
    refreshTokenExpirationOffsetSeconds: TOKEN_EXPIRY_BUFFER_SECONDS,
  };

  let result = await msalInstance.acquireTokenSilent(request);

  // MSAL decides cache validity from the access token. The API uses the ID
  // token, so refresh it explicitly when the cached ID token is stale.
  if (!forceRefresh && (!result.idToken || !isMicrosoftTokenFresh(result.idToken))) {
    result = await msalInstance.acquireTokenSilent({
      ...request,
      forceRefresh: true,
    });
  }

  if (!result.idToken || !isMicrosoftTokenFresh(result.idToken)) {
    throw new Error("Microsoft ID Token 已過期");
  }

  if (result.account) {
    msalInstance.setActiveAccount(result.account);
  }

  return result.idToken;
};

const redirectForMicrosoftReauthentication = async (account) => {
  if (microsoftRedirectInProgress) {
    throw new Error("Microsoft 認證需要重新登入");
  }

  microsoftRedirectInProgress = true;
  try {
    await msalInstance.acquireTokenRedirect({
      ...loginRequest,
      account,
      redirectStartPage: window.location.href,
    });
  } catch (redirectError) {
    console.error("Microsoft 重新驗證失敗:", redirectError);
    throw new Error("Microsoft 認證已過期，請重新登入");
  } finally {
    // A real redirect unloads this page. Resetting also keeps tests and
    // recoverable redirect failures from permanently blocking re-authentication.
    microsoftRedirectInProgress = false;
  }

  throw new Error("Microsoft 認證需要重新登入");
};

const acquireMicrosoftToken = async (account, forceRefresh) => {
  if (microsoftTokenRequest) {
    return microsoftTokenRequest;
  }

  microsoftTokenRequest = (async () => {
    try {
      return await acquireMicrosoftTokenSilently(account, forceRefresh);
    } catch (silentError) {
      if (!isInteractionRequiredError(silentError)) {
        console.debug("無法靜默取得 Microsoft Token:", silentError?.message);
        throw new Error("無法取得 Microsoft 認證，請重新登入");
      }

      return redirectForMicrosoftReauthentication(account);
    }
  })();

  try {
    return await microsoftTokenRequest;
  } finally {
    microsoftTokenRequest = null;
  }
};

export const acquireAccessToken = async ({ forceRefresh = false } = {}) => {
  // 優先檢查是否有 Google Token
  const googleToken = getGoogleToken();
  if (googleToken) return googleToken;

  // 若無 Google Token，則走 Microsoft 流程
  const account = getActiveAccount();
  if (!account) {
    throw new Error("尚未登入");
  }

  return acquireMicrosoftToken(account, forceRefresh);
};
