import { loginRequest, msalInstance } from "./msalClient";

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
    const result = await msalInstance.acquireTokenPopup({
      ...loginRequest,
      account,
    });
    return result.accessToken;
  }
};
