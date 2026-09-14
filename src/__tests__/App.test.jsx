import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuthContext } from "../context/AuthContext";
import App from "../App";

const mocks = vi.hoisted(() => ({
  getAuthSession: vi.fn(),
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("../services/authService", () => ({
  getAuthSession: mocks.getAuthSession,
  loginWithGoogle: vi.fn(),
  loginWithMicrosoft: vi.fn(),
  logout: vi.fn(),
}));
vi.mock("../services/adminService", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
}));
vi.mock("../services/apiClient", () => ({
  clearCsrfToken: vi.fn(),
  setAuthExpiredHandler: vi.fn(),
}));
vi.mock("../config", () => ({ AUTH_BYPASS: false }));
vi.mock("../pages/CreatePage", () => ({ default: () => <h1>Creation</h1> }));
vi.mock("../pages/LibraryPage", () => ({ default: () => <h1>Library</h1> }));
vi.mock("../pages/LoginPage", () => ({ default: () => <h1>Login</h1> }));
vi.mock("../components/auth/SessionExpiryBanner", () => ({ default: () => null }));
vi.mock("../pages/AdminPage", () => ({
  default: function AdminProbe() {
    const { refreshProfile, isProfileLoading, profileError } = useAuthContext();
    const [section, setSection] = useState("users");
    const [message, setMessage] = useState("");
    const refresh = async () => {
      setMessage("Saved");
      try {
        await refreshProfile();
      } catch (error) {
        setMessage(`Refresh failed: ${error.message}`);
      }
    };
    return (
      <>
        <h1>Administration</h1>
        <button onClick={() => setSection("models")}>Models</button>
        <output aria-label="Section">{section}</output>
        <button onClick={refresh}>Save and refresh</button>
        <output aria-label="Refreshing">{String(isProfileLoading)}</output>
        <output aria-label="Message">{message}</output>
        <output aria-label="Profile error">{profileError}</output>
      </>
    );
  },
}));

const adminProfile = {
  user: { id: "admin-id", email: "admin@example.com", role: "admin" },
  modelPolicy: { allowedModels: [], defaultModel: null },
  imageModels: [],
};

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderApp() {
  render(<AuthProvider><App /></AuthProvider>);
}

describe("administration route profile refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/admin");
    mocks.getAuthSession.mockResolvedValue({
      authenticated: true,
      user: { email: "admin@example.com", displayName: "Admin" },
    });
    mocks.getCurrentUserProfile.mockResolvedValue(adminProfile);
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, "", "/");
  });

  it("waits for initial authorization and denies a non-admin profile", async () => {
    const initialProfile = deferred();
    mocks.getCurrentUserProfile.mockReturnValueOnce(initialProfile.promise);
    renderApp();
    await waitFor(() => expect(mocks.getCurrentUserProfile).toHaveBeenCalledOnce());
    expect(screen.queryByRole("heading", { name: "Administration" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    await act(async () => {
      initialProfile.resolve({ ...adminProfile, user: { ...adminProfile.user, role: "viewer" } });
    });
    expect(await screen.findByRole("heading", { name: "Creation" })).toBeInTheDocument();
  });

  it.each(["success", "failure"])("keeps the selected section mounted across refresh %s", async (outcome) => {
    renderApp();
    await screen.findByRole("heading", { name: "Administration" });
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    const refresh = deferred();
    mocks.getCurrentUserProfile.mockReturnValueOnce(refresh.promise);
    fireEvent.click(screen.getByRole("button", { name: "Save and refresh" }));
    expect(screen.getByLabelText("Section")).toHaveTextContent("models");
    expect(screen.getByLabelText("Refreshing")).toHaveTextContent("true");
    expect(screen.getByLabelText("Message")).toHaveTextContent("Saved");

    await act(async () => {
      if (outcome === "success") refresh.resolve(adminProfile);
      else refresh.reject(new Error("Profile unavailable"));
    });

    expect(screen.getByLabelText("Section")).toHaveTextContent("models");
    expect(screen.getByLabelText("Refreshing")).toHaveTextContent("false");
    expect(screen.getByLabelText("Message")).toHaveTextContent(
      outcome === "success" ? "Saved" : "Refresh failed: Profile unavailable",
    );
    if (outcome === "failure") {
      expect(screen.getByLabelText("Profile error")).toHaveTextContent("Profile unavailable");
    }
  });

  it("removes the administration screen when refreshed authorization revokes the role", async () => {
    renderApp();
    await screen.findByRole("heading", { name: "Administration" });
    mocks.getCurrentUserProfile.mockResolvedValueOnce({
      ...adminProfile, user: { ...adminProfile.user, role: "viewer" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save and refresh" }));
    expect(await screen.findByRole("heading", { name: "Creation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Administration" })).not.toBeInTheDocument();
  });
});
