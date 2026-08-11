import { API_BASE_URL } from "../config";
import {
  apiGet,
  apiPost,
  clearCsrfToken,
  setCsrfToken,
} from "./apiClient";

const getCurrentReturnTo = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

export const getAuthSession = async () => {
  const session = await apiGet(`${API_BASE_URL}/auth/session`, {
    auth: false,
    csrf: false,
  });

  if (session?.authenticated && session.csrfToken) {
    setCsrfToken(session.csrfToken);
  } else {
    clearCsrfToken();
  }

  return session;
};

export const loginWithMicrosoft = ({ returnTo = getCurrentReturnTo() } = {}) => {
  const params = new URLSearchParams({ returnTo });
  window.location.assign(`${API_BASE_URL}/auth/entra/start?${params.toString()}`);
};

export const loginWithGoogle = async (credential) => {
  if (!credential) {
    throw new Error("Google 登入未提供有效 credential");
  }

  return apiPost(
    `${API_BASE_URL}/auth/google`,
    { credential },
    { auth: false, csrf: false }
  );
};

export const logout = async () => {
  try {
    return await apiPost(`${API_BASE_URL}/auth/logout`, {});
  } finally {
    clearCsrfToken();
  }
};
