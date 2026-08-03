import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
  const {
    user,
    profile,
    isAdmin,
    isProfileLoading,
    profileError,
    handleMicrosoftLogin,
    handleGoogleLoginSuccess,
    handleLogout,
    isAuthenticated,
    isLoading,
    authExpired,
    authExpiredWarning,
    dismissAuthExpiredWarning,
  } = useAuthContext();

  return {
    user,
    profile,
    isAdmin,
    isProfileLoading,
    profileError,
    handleMicrosoftLogin,
    handleGoogleLoginSuccess,
    handleLogout,
    isAuthenticated,
    isLoading,
    authExpired,
    authExpiredWarning,
    dismissAuthExpiredWarning,
  };
}
