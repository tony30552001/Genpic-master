import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../authService", () => ({
  acquireAccessToken: vi.fn(() => Promise.resolve("token")),
}));

import { apiGet, apiPost, apiDelete } from "../apiClient";

describe("apiClient", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  it("apiGet returns JSON on success", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: "ok" }),
    });

    const result = await apiGet("/health");
    expect(result).toEqual({ status: "ok" });
  });

  it("apiGet throws on error", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("boom"),
    });

    await expect(apiGet("/health")).rejects.toThrow("boom");
  });

  it("apiPost sends JSON body", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 1 }),
    });

    const result = await apiPost("/styles", { name: "Style" });
    expect(result).toEqual({ id: 1 });
    expect(global.fetch).toHaveBeenCalledWith(
      "/styles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Style" }),
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("apiDelete supports no-content", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn(),
    });

    const result = await apiDelete("/styles/1");
    expect(result).toBeNull();
  });
});
