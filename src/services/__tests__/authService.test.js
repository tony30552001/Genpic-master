import { describe, it, expect, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loginPopup: vi.fn(() => Promise.resolve({ account: { id: "1" } })),
  logoutPopup: vi.fn(),
  acquireTokenSilent: vi.fn(() => Promise.resolve({ accessToken: "token" })),
  acquireTokenPopup: vi.fn(() => Promise.resolve({ accessToken: "token" })),
  getActiveAccount: vi.fn(() => ({ id: "1" })),
  setActiveAccount: vi.fn(),
  getAllAccounts: vi.fn(() => [{ id: "1" }]),
}));

vi.mock("../msalClient", () => ({
  loginRequest: { scopes: ["User.Read"] },
  msalInstance: {
    loginPopup: mocks.loginPopup,
    logoutPopup: mocks.logoutPopup,
    acquireTokenSilent: mocks.acquireTokenSilent,
    acquireTokenPopup: mocks.acquireTokenPopup,
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
    const account = await loginWithMicrosoft();
    expect(mocks.loginPopup).toHaveBeenCalled();
    expect(mocks.setActiveAccount).toHaveBeenCalled();
    expect(account).toEqual({ id: "1" });
  });

  it("logout uses popup", async () => {
    await logout();
    expect(mocks.logoutPopup).toHaveBeenCalled();
  });

  it("acquireAccessToken uses silent first", async () => {
    const token = await acquireAccessToken();
    expect(mocks.acquireTokenSilent).toHaveBeenCalled();
    expect(token).toBe("token");
  });

  it("acquireAccessToken falls back to popup", async () => {
    mocks.acquireTokenSilent.mockRejectedValueOnce(new Error("fail"));
    const token = await acquireAccessToken();
    expect(mocks.acquireTokenPopup).toHaveBeenCalled();
    expect(token).toBe("token");
  });
});
