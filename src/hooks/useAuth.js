import { useCallback, useEffect, useMemo } from "react";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";

import { loginWithMicrosoft, logout } from "../services/authService";
import { AUTH_BYPASS } from "../config";

export default function useAuth() {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();

  useEffect(() => {
    if (AUTH_BYPASS) return;
    if (!instance.getActiveAccount() && accounts.length > 0) {
      instance.setActiveAccount(accounts[0]);
    }
  }, [accounts, instance]);

  const user = useMemo(() => {
    if (AUTH_BYPASS) {
      return {
        displayName: "Local Dev",
        email: "local.dev@example.com",
        photoURL: null,
        isAnonymous: true,
      };
    }

    if (!isAuthenticated || accounts.length === 0) return null;
    const account = accounts[0];
    return {
      displayName: account.name || account.username,
      email: account.username,
      photoURL: null,
      isAnonymous: false,
    };
  }, [isAuthenticated, accounts]);

  const handleMicrosoftLogin = useCallback(async () => {
    if (AUTH_BYPASS) return;
    await loginWithMicrosoft();
  }, []);

  const handleLogout = useCallback(async () => {
    if (AUTH_BYPASS) return;
    await logout();
  }, []);

  return { user, handleMicrosoftLogin, handleLogout };
}
