import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
  const {
    user,
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
