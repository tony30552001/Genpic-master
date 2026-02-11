import { useAuthContext } from "../context/AuthContext";

export default function useAuth() {
  const {
    user,
    handleMicrosoftLogin,
    handleGoogleLoginSuccess,
    handleLogout,
    isAuthenticated,
    isLoading,
    authExpired
  } = useAuthContext();

  return {
    user,
    handleMicrosoftLogin,
    handleGoogleLoginSuccess,
    handleLogout,
    isAuthenticated,
    isLoading,
    authExpired
  };
}
