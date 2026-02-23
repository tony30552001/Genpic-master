import { jwtDecode } from "jwt-decode";
import { loginRequest, msalInstance } from "./msalClient";

// 提前 5 分鐘判定 Token 過期，避免在請求途中過期
const TOKEN_EXPIRY_BUFFER_SECONDS = 5 * 60;

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
  } catch (e) {
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
  } catch (e) {
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
  await msalInstance.loginRedirect(loginRequest);
  // Redirect 模式下，登入成功後的處理會由 handleRedirectPromise 在頁面重新載入後完成
  // 因此這裡不需要回傳 result
};

export const logout = async () => {
  const account = getActiveAccount();
  if (!account) return;
  // 改用 Redirect 模式登出
  await msalInstance.logoutRedirect({ account });
};

export const acquireAccessToken = async () => {
  // 優先檢查是否有 Google Token
  const googleToken = getGoogleToken();
  if (googleToken) return googleToken;

  // 若無 Google Token，則走 Microsoft 流程
  const account = getActiveAccount();
  if (!account) {
    throw new Error("尚未登入");
  }

  try {
    const result = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account,
    });
    return result.idToken;
  } catch (error) {
    console.warn('[Auth] 無法靜默取得 Access Token:', error.errorCode || error.message);

    // InteractionRequiredAuthError：需要使用者互動（session 過期、MFA、consent 等）
    // 此時自動導向登入，不應讓後續 API 請求繼續嘗試
    const needsInteraction = [
      'interaction_required',
      'login_required',
      'consent_required',
      'block_iframe_reload',
      'monitor_session_iframe_timeout',
    ].some(code => (error.errorCode || '').includes(code));

    if (needsInteraction) {
      console.warn('[Auth] 需要重新登入，自動重新導向...');
      // 延遲執行避免在 React 渲染過程中直接跳轉
      setTimeout(() => {
        msalInstance.loginRedirect({ ...loginRequest, account }).catch(() => {
          // 若 redirect 失敗（例如在 iframe 內），僅記錄警告
          console.warn('[Auth] loginRedirect 失敗，請手動重新整理頁面');
        });
      }, 100);
      throw new Error("認證已過期，正在重新導向登入頁面...");
    }

    // 其他錯誤（例如 timed_out，可能是暫時性問題），讓呼叫者決定如何處理
    throw new Error("認證已過期，請重新登入");
  }
};
