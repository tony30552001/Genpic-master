import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  clearCsrfToken,
  setAuthExpiredHandler,
} from "../services/apiClient";
import {
  getAuthSession,
  loginWithGoogle,
  loginWithMicrosoft,
  logout,
} from "../services/authService";
import { getCurrentUserProfile } from "../services/adminService";
import { AUTH_BYPASS } from "../config";

const AuthContext = createContext(null);

const LOCAL_USER = {
  displayName: "Local Dev",
  email: "local.dev@example.com",
  photoURL: null,
  isAnonymous: true,
  authType: "bypass",
};

const clearLegacyAuthStorage = () => {
  if (typeof localStorage === "undefined") return;

  localStorage.removeItem("google_user");
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("msal.")) {
      localStorage.removeItem(key);
    }
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(AUTH_BYPASS ? LOCAL_USER : null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(!AUTH_BYPASS);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [authExpired, setAuthExpired] = useState(false);
  const [authExpiredWarning, setAuthExpiredWarning] = useState(false);

  const loadSession = useCallback(async () => {
    if (AUTH_BYPASS) {
      setUser(LOCAL_USER);
      setAuthExpired(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const session = await getAuthSession();
      if (session?.authenticated && session.user) {
        setUser(session.user);
        setAuthExpired(false);
        setAuthExpiredWarning(false);
      } else {
        setUser(null);
        setProfile(null);
      }
    } catch (error) {
      setUser(null);
      setProfile(null);
      setProfileError(error.message || "無法載入登入工作階段");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    clearLegacyAuthStorage();
    const timerId = window.setTimeout(() => {
      void loadSession();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadSession]);

  const handleAuthExpired = useCallback(() => {
    clearCsrfToken();
    setUser(null);
    setProfile(null);
    setAuthExpired(true);
    setAuthExpiredWarning(true);
  }, []);

  useEffect(() => {
    setAuthExpiredHandler(handleAuthExpired);
    return () => setAuthExpiredHandler(null);
  }, [handleAuthExpired]);

  const handleGoogleLoginSuccess = useCallback(async (credentialResponse) => {
    setProfileError("");
    try {
      await loginWithGoogle(credentialResponse?.credential);
      await loadSession();
    } catch (error) {
      setAuthExpired(true);
      setProfileError(error.message || "Google 登入失敗，請稍後再試");
    }
  }, [loadSession]);

  const handleMicrosoftLogin = useCallback(
    ({ returnTo } = {}) => loginWithMicrosoft({ returnTo }),
    []
  );

  const handleLogout = useCallback(async () => {
    setProfileError("");
    try {
      await logout();
    } catch (error) {
      setProfileError(error.message || "登出失敗");
    } finally {
      clearCsrfToken();
      setUser(null);
      setProfile(null);
      setAuthExpired(false);
      setAuthExpiredWarning(false);
    }
  }, []);

  const dismissAuthExpiredWarning = useCallback(() => {
    setAuthExpiredWarning(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (isLoading || !user) {
        setProfile(null);
        setProfileError("");
        setIsProfileLoading(false);
        return;
      }

      setIsProfileLoading(true);
      setProfileError("");
      try {
        const data = await getCurrentUserProfile();
        if (cancelled) return;
        setProfile(
          data?.user
            ? { ...data.user, modelPolicy: data.modelPolicy || null }
            : null
        );
      } catch (error) {
        if (cancelled) return;
        setProfile(null);
        setProfileError(error.message || "無法載入使用者設定");
      } finally {
        if (!cancelled) setIsProfileLoading(false);
      }
    };

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  const value = {
    user,
    profile,
    isAdmin: profile?.role === "admin",
    isProfileLoading,
    profileError,
    isLoading,
    authExpired,
    authExpiredWarning,
    dismissAuthExpiredWarning,
    handleMicrosoftLogin,
    handleGoogleLoginSuccess,
    handleLogout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used within AuthProvider");
  return context;
};
