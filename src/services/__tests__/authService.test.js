import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  clearCsrfToken: vi.fn(),
  setCsrfToken: vi.fn(),
}));

vi.mock("../apiClient", () => ({
  apiGet: mocks.apiGet,
  apiPost: mocks.apiPost,
  clearCsrfToken: mocks.clearCsrfToken,
  setCsrfToken: mocks.setCsrfToken,
}));

vi.mock("../../config", () => ({
  API_BASE_URL: "/api",
}));

import {
  getAuthSession,
  loginWithGoogle,
  loginWithMicrosoft,
  logout,
} from "../authService";

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("window", {
      location: {
        pathname: "/history",
        search: "?page=2",
        hash: "#top",
        assign: vi.fn(),
      },
    });
  });

  it("loads the server session and stores its CSRF token", async () => {
    mocks.apiGet.mockResolvedValue({
      authenticated: true,
      csrfToken: "csrf-token",
      user: { email: "user@example.com" },
    });

    await expect(getAuthSession()).resolves.toEqual(
      expect.objectContaining({ authenticated: true })
    );
    expect(mocks.apiGet).toHaveBeenCalledWith("/api/auth/session", {
      auth: false,
      csrf: false,
    });
    expect(mocks.setCsrfToken).toHaveBeenCalledWith("csrf-token");
  });

  it("clears the CSRF token when no server session exists", async () => {
    mocks.apiGet.mockResolvedValue({ authenticated: false });

    await getAuthSession();

    expect(mocks.clearCsrfToken).toHaveBeenCalled();
  });

  it("sends the Google credential to the BFF once", async () => {
    mocks.apiPost.mockResolvedValue({ authenticated: true });

    await loginWithGoogle("google-credential");

    expect(mocks.apiPost).toHaveBeenCalledWith(
      "/api/auth/google",
      { credential: "google-credential" },
      { auth: false, csrf: false }
    );
  });

  it("redirects Microsoft login to the BFF callback start route", () => {
    loginWithMicrosoft();

    expect(window.location.assign).toHaveBeenCalledWith(
      "/api/auth/entra/start?returnTo=%2Fhistory%3Fpage%3D2%23top"
    );
  });

  it("clears the CSRF token after logout", async () => {
    mocks.apiPost.mockResolvedValue(null);

    await logout();

    expect(mocks.apiPost).toHaveBeenCalledWith("/api/auth/logout", {});
    expect(mocks.clearCsrfToken).toHaveBeenCalled();
  });
});
