import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config", () => ({
  AUTH_BYPASS: false,
}));

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPostBlob,
  AuthExpiredError,
  setAuthExpiredHandler,
  setCsrfToken,
} from "../apiClient";

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: vi.fn().mockResolvedValue(JSON.stringify(body)),
});

describe("apiClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    setAuthExpiredHandler(null);
    setCsrfToken(null);
  });

  it("apiGet uses the server session cookie", async () => {
    global.fetch.mockResolvedValue(jsonResponse({ status: "ok" }));

    await expect(apiGet("/health")).resolves.toEqual({ status: "ok" });

    expect(global.fetch).toHaveBeenCalledWith(
      "/health",
      expect.objectContaining({
        method: "GET",
        credentials: "include",
      })
    );
    expect(global.fetch.mock.calls[0][1].headers).not.toHaveProperty("X-Auth-Token");
  });

  it("apiPost includes the in-memory CSRF token", async () => {
    setCsrfToken("csrf-token");
    global.fetch.mockResolvedValue(jsonResponse({ id: 1 }));

    await expect(apiPost("/styles", { name: "Style" })).resolves.toEqual({ id: 1 });

    expect(global.fetch.mock.calls[0][1].headers).toEqual(
      expect.objectContaining({
        "Content-Type": "application/json",
        "X-CSRF-Token": "csrf-token",
      })
    );
  });

  it("rejects mutating requests when the session CSRF token is missing", async () => {
    await expect(apiPost("/styles", { name: "Style" })).rejects.toBeInstanceOf(
      AuthExpiredError
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("notifies the auth context when the server returns 401", async () => {
    const onExpired = vi.fn();
    setCsrfToken("csrf-token");
    setAuthExpiredHandler(onExpired);
    global.fetch.mockResolvedValue(jsonResponse({ error: { message: "expired" } }, 401));

    await expect(apiGet("/me")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it("apiDelete supports no-content responses", async () => {
    setCsrfToken("csrf-token");
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn(),
    });

    await expect(apiDelete("/styles/1")).resolves.toBeNull();
  });

  it("apiPostBlob returns binary responses", async () => {
    const blob = new Blob(["pptx"]);
    setCsrfToken("csrf-token");
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(blob),
    });

    await expect(apiPostBlob("/generate-presentation", { slides: [] })).resolves.toBe(blob);
    expect(global.fetch.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ slides: [] }),
      })
    );
  });
});
