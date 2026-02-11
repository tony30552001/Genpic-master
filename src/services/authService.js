import { loginRequest, msalInstance } from "./msalClient";

// 從 AuthContext 外部獲取 Google User Token 的後路方法
const getGoogleToken = () => {
  try {
    const savedUser = localStorage.getItem('google_user');
    if (savedUser) {
      const user = JSON.parse(savedUser);
      return user.idToken || null;
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
    return result.accessToken;
  } catch (error) {
    // Silent 失敗則嘗試彈窗（通常用於 MFA 或過期）
    try {
      const result = await msalInstance.acquireTokenPopup({
        ...loginRequest,
        account,
      });
      return result.accessToken;
    } catch (popupError) {
      throw new Error("認證已過期，請重新登入");
    }
  }
};
