import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
  logout: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  clearCsrfToken: vi.fn(),
  setAuthExpiredHandler: vi.fn(),
}));

vi.mock("../../services/authService", () => ({
  getAuthSession: mocks.getAuthSession,
  loginWithGoogle: mocks.loginWithGoogle,
  loginWithMicrosoft: mocks.loginWithMicrosoft,
  logout: mocks.logout,
}));

vi.mock("../../services/adminService", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));

vi.mock("../../services/apiClient", () => ({
  clearCsrfToken: mocks.clearCsrfToken,
  setAuthExpiredHandler: mocks.setAuthExpiredHandler,
}));

vi.mock("../../config", () => ({
  AUTH_BYPASS: false,
}));

import { useAuthContext } from "../AuthContext";
import { AuthProvider } from "../AuthContext";

function AuthProbe() {
  const { user, profile, isAuthenticated, isLoading } = useAuthContext();

  return (
    <output>
      {JSON.stringify({
        email: user?.email || null,
        role: profile?.role || null,
        isAuthenticated,
        isLoading,
      })}
    </output>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAuthSession.mockResolvedValue({
      authenticated: true,
      csrfToken: "csrf-token",
      user: {
        email: "user@example.com",
        displayName: "User",
        authType: "microsoft",
      },
    });
    mocks.getCurrentUserProfile.mockResolvedValue({
      user: {
        id: "user-id",
        email: "user@example.com",
        displayName: "User",
        role: "viewer",
      },
      modelPolicy: null,
    });
  });

  it("bootstraps authentication from the BFF session", async () => {
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/user@example.com/)).toBeInTheDocument();
    });
    expect(mocks.getAuthSession).toHaveBeenCalledOnce();
    expect(mocks.getCurrentUserProfile).toHaveBeenCalledOnce();
  });
});
