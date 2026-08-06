import { describe, it, expect, vi } from "vitest";
import { InteractionRequiredAuthError } from "@azure/msal-browser";

const mocks = vi.hoisted(() => ({
  loginRedirect: vi.fn(() => Promise.resolve()),
  logoutRedirect: vi.fn(),
  acquireTokenSilent: vi.fn(() => Promise.resolve({
    accessToken: "access-token",
    idToken: "id-token",
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
  it("loginWithMicrosoft sets active account", async () => {
    await loginWithMicrosoft();
    expect(mocks.loginRedirect).toHaveBeenCalledWith({
      scopes: ["User.Read"],
    });
  });

  it("logout uses redirect", async () => {
    await logout();
    expect(mocks.logoutRedirect).toHaveBeenCalled();
  });

  it("acquireAccessToken uses silent first", async () => {
    const token = await acquireAccessToken();
    expect(mocks.acquireTokenSilent).toHaveBeenCalled();
    expect(token).toBe("id-token");
  });

  it("acquireAccessToken redirects when interaction is required", async () => {
    mocks.acquireTokenSilent.mockRejectedValueOnce(
      new InteractionRequiredAuthError("interaction_required")
    );

    await expect(acquireAccessToken()).rejects.toThrow("需要重新登入");
    expect(mocks.acquireTokenRedirect).toHaveBeenCalled();
  });

  it("acquireAccessToken can force a cache refresh", async () => {
    await acquireAccessToken({ forceRefresh: true });
    expect(mocks.acquireTokenSilent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        forceRefresh: true,
        refreshTokenExpirationOffsetSeconds: 300,
      })
    );
  });
});
