import { describe, it, expect, vi } from "vitest";

const loginPopup = vi.fn(() => Promise.resolve({ account: { id: "1" } }));
const logoutPopup = vi.fn();
const acquireTokenSilent = vi.fn(() => Promise.resolve({ accessToken: "token" }));
const acquireTokenPopup = vi.fn(() => Promise.resolve({ accessToken: "token" }));
const getActiveAccount = vi.fn(() => ({ id: "1" }));
const setActiveAccount = vi.fn();
const getAllAccounts = vi.fn(() => [{ id: "1" }]);

vi.mock("../msalClient", () => ({
  loginRequest: { scopes: ["User.Read"] },
  msalInstance: {
    loginPopup,
    logoutPopup,
    acquireTokenSilent,
    acquireTokenPopup,
    getActiveAccount,
    setActiveAccount,
    getAllAccounts,
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
    expect(loginPopup).toHaveBeenCalled();
    expect(setActiveAccount).toHaveBeenCalled();
    expect(account).toEqual({ id: "1" });
  });

  it("logout uses popup", async () => {
    await logout();
    expect(logoutPopup).toHaveBeenCalled();
  });

  it("acquireAccessToken uses silent first", async () => {
    const token = await acquireAccessToken();
    expect(acquireTokenSilent).toHaveBeenCalled();
    expect(token).toBe("token");
  });

  it("acquireAccessToken falls back to popup", async () => {
    acquireTokenSilent.mockRejectedValueOnce(new Error("fail"));
    const token = await acquireAccessToken();
    expect(acquireTokenPopup).toHaveBeenCalled();
    expect(token).toBe("token");
  });
});
