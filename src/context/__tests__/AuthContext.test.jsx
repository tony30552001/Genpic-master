import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
afterEach(cleanup);

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
  logout: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  clearCsrfToken: vi.fn(),
  setAuthExpiredHandler: vi.fn(),
  onRefreshError: vi.fn(),
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
  const { user, profile, isAdmin, isAuthenticated, isLoading, refreshProfile, profileError } = useAuthContext();

  return (
    <>
    <button onClick={() => { void refreshProfile().catch(mocks.onRefreshError); }}>Refresh</button>
    <output data-testid="profile">
      {JSON.stringify({
        email: user?.email || null,
        role: profile?.role || null,
        isAuthenticated,
        isAdmin,
        isLoading,
        imageModels: profile?.imageModels,
        modelPolicy: profile?.modelPolicy,
        profileError,
      })}
    </output>
    </>
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
      imageModels: [],
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
    await waitFor(() => expect(mocks.getCurrentUserProfile).toHaveBeenCalledOnce());
  });

  it("stores the catalog and refreshes policy without a static default", async () => {
    const imageModels = [{
      modelKey: "custom-deployment", label: "Custom", apiType: "azure-openai-images-v1",
      supportedQualities: ["auto", "max"], defaultQuality: "auto",
    }];
    const modelPolicy = { allowedModels: ["custom-deployment"], defaultModel: "custom-deployment", updatedAt: "now" };
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      user: { role: "admin" }, imageModels, modelPolicy,
    });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).imageModels).toEqual(imageModels));
    expect(JSON.parse(screen.getByTestId("profile").textContent).modelPolicy).toEqual(modelPolicy);
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      user: { role: "admin" }, imageModels: [], modelPolicy: { allowedModels: [], defaultModel: null, updatedAt: "later" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).modelPolicy.defaultModel).toBeNull());
    expect(JSON.parse(screen.getByTestId("profile").textContent)).toMatchObject({
      isAuthenticated: true, role: "admin", imageModels: [],
    });
  });

  it("lets an administrator sign in before configuring the first image model", async () => {
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      user: { role: "admin" }, imageModels: [],
      modelPolicy: { allowedModels: [], defaultModel: null, updatedAt: null },
    });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).role).toBe("admin"));
    expect(JSON.parse(screen.getByTestId("profile").textContent)).toMatchObject({
      isAuthenticated: true, imageModels: [], modelPolicy: { defaultModel: null }, profileError: "",
    });
  });

  it("rejects refresh failures while preserving admin access, then reloads catalog-only changes", async () => {
    const model = {
      modelKey: "custom-model", label: "Custom", apiType: "azure-openai-images-v1",
      supportedQualities: ["low", "medium", "high", "max"], defaultQuality: "medium",
    };
    const modelPolicy = { allowedModels: [model.modelKey], defaultModel: model.modelKey, updatedAt: "same-policy" };
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      user: { role: "admin", email: "user@example.com" }, imageModels: [model], modelPolicy,
    });
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).role).toBe("admin"));
    mocks.getCurrentUserProfile.mockRejectedValueOnce(new Error("Profile unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).profileError).toBe("Profile unavailable"));
    expect(JSON.parse(screen.getByTestId("profile").textContent)).toMatchObject({
      isAuthenticated: true, isAdmin: true, role: "admin", modelPolicy, imageModels: [model],
    });
    expect(mocks.onRefreshError).toHaveBeenCalledWith(expect.objectContaining({ message: "Profile unavailable" }));
    const updatedModel = { ...model, supportedQualities: ["low", "high"], defaultQuality: "high" };
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      user: { role: "admin", email: "user@example.com" }, imageModels: [updatedModel], modelPolicy,
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(JSON.parse(screen.getByTestId("profile").textContent).imageModels).toEqual([updatedModel]));
    expect(JSON.parse(screen.getByTestId("profile").textContent)).toMatchObject({
      isAdmin: true, modelPolicy, profileError: "",
    });
  });
});
