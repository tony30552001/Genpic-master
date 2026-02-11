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
  const result = await msalInstance.loginPopup(loginRequest);
  if (result?.account) {
    msalInstance.setActiveAccount(result.account);
  }
  return result?.account || null;
};

export const logout = async () => {
  const account = getActiveAccount();
  if (!account) return;
  await msalInstance.logoutPopup({ account });
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
