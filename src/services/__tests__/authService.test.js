import { beforeEach, describe, it, expect, vi } from "vitest";
import { InteractionRequiredAuthError } from "@azure/msal-browser";

const makeJwt = (payload) => {
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `eyJhbGciOiJSUzI1NiJ9.${encodedPayload}.signature`;
};

const freshIdToken = makeJwt({
  exp: Math.floor(Date.now() / 1000) + 3600,
});

const mocks = vi.hoisted(() => ({
  loginRedirect: vi.fn(() => Promise.resolve()),
  logoutRedirect: vi.fn(),
  acquireTokenSilent: vi.fn(() => Promise.resolve({
    accessToken: "access-token",
    idToken: freshIdToken,
  })),
  acquireTokenRedirect: vi.fn(() => Promise.resolve()),
  getActiveAccount: vi.fn(() => ({ id: "1" })),
  setActiveAccount: vi.fn(),
  getAllAccounts: vi.fn(() => [{ id: "1" }]),
}));

vi.mock("../msalClient", () => ({
  loginRequest: { scopes: ["User.Read"] },
  msalInstance: {
    loginRedirect: mocks.loginRedirect,
    logoutRedirect: mocks.logoutRedirect,
    acquireTokenSilent: mocks.acquireTokenSilent,
    acquireTokenRedirect: mocks.acquireTokenRedirect,
    getActiveAccount: mocks.getActiveAccount,
    setActiveAccount: mocks.setActiveAccount,
    getAllAccounts: mocks.getAllAccounts,
  },
}));

import {
  loginWithMicrosoft,
  logout,
  acquireAccessToken,
} from "../authService";

describe("authService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquireTokenSilent.mockResolvedValue({
      accessToken: "access-token",
      idToken: freshIdToken,
    });
    mocks.acquireTokenRedirect.mockResolvedValue();
  });

  it("loginWithMicrosoft sets active account", async () => {
    await loginWithMicrosoft();
    expect(mocks.loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
      redirectStartPage: window.location.href,
    });
  });

  it("logout uses redirect", async () => {
    await logout();
    expect(mocks.logoutRedirect).toHaveBeenCalled();
  });

  it("acquireAccessToken uses silent first", async () => {
    const token = await acquireAccessToken();
    expect(mocks.acquireTokenSilent).toHaveBeenCalled();
    expect(token).toBe(freshIdToken);
  });

  it("acquireAccessToken redirects when interaction is required", async () => {
    mocks.acquireTokenSilent.mockRejectedValueOnce(
      new InteractionRequiredAuthError("interaction_required")
    );

    await expect(acquireAccessToken()).rejects.toThrow("需要重新登入");
    expect(mocks.acquireTokenRedirect).toHaveBeenCalled();
  });

  it("refreshes a stale ID token even when MSAL returns a cached result", async () => {
    const staleIdToken = makeJwt({
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    mocks.acquireTokenSilent
      .mockResolvedValueOnce({
        accessToken: "cached-access-token",
        idToken: staleIdToken,
      })
      .mockResolvedValueOnce({
        accessToken: "refreshed-access-token",
        idToken: freshIdToken,
      });

    const token = await acquireAccessToken();

    expect(token).toBe(freshIdToken);
    expect(mocks.acquireTokenSilent).toHaveBeenCalledTimes(2);
    expect(mocks.acquireTokenSilent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceRefresh: true,
      })
    );
  });

  it("acquireAccessToken can force a cache refresh", async () => {
    await acquireAccessToken({ forceRefresh: true });
    expect(mocks.acquireTokenSilent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceRefresh: true,
        redirectUri: window.location.origin,
        refreshTokenExpirationOffsetSeconds: 300,
      })
    );
  });
});
