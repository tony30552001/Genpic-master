import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const db = require("../../_shared/db");
const adminAuth = require("../../_shared/admin");
const rateLimit = require("../../_shared/rateLimit");

db.query = vi.fn();
adminAuth.requireAdmin = vi.fn();
rateLimit.rateLimit = vi.fn(() => ({ limited: false }));

const handler = require("../index");

const identity = { tenantId: "tenant-1", userId: "user-1", role: "admin" };

const invoke = async (req) => {
  const context = { bindingData: {} };
  await handler(context, req);
  return context.res;
};

describe("admin resources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    adminAuth.requireAdmin.mockResolvedValue({ identity });
  });

  it("lists history without embedding the stored image", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "history-1",
            has_image: true,
            prompt: "prompt",
            user_script: null,
            style_prompt: null,
            model: "gemini-imagen",
            style_id: null,
            created_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            user_email: "alice@example.com",
            user_display_name: "Alice",
            style_name: null,
          },
        ],
      });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history" },
      query: {},
    });

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ id: "history-1", hasImage: true });
    expect(res.body.items[0]).not.toHaveProperty("imageUrl");
    expect(db.query.mock.calls[1][0]).not.toMatch(/h\.image_url,/);
  });

  it("returns a single history image with a cache header", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ image_url: "data:image/jpeg;base64,AAAA" }],
    });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history-images", id: "history-1" },
      query: {},
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imageUrl: "data:image/jpeg;base64,AAAA" });
    expect(res.headers["Cache-Control"]).toBe("private, max-age=3600");
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining("FROM history"), [
      "history-1",
      "tenant-1",
    ]);
  });

  it("returns 404 when the history image is missing", async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history-images", id: "history-1" },
      query: {},
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns a single style preview", async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ preview_url: "data:image/jpeg;base64,BBBB" }],
    });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "style-previews", id: "style-1" },
      query: {},
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ imageUrl: "data:image/jpeg;base64,BBBB" });
  });

  it("rejects a style preview request without an id", async () => {
    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "style-previews" },
      query: {},
    });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("filters the user list by an escaped keyword and returns the auth provider", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ total: 1 }] }).mockResolvedValueOnce({
      rows: [
        {
          id: "user-1",
          email: "alice@example.com",
          display_name: "Alice",
          role: "viewer",
          is_active: true,
          auth_provider: "entra",
          created_at: "2026-01-01T00:00:00.000Z",
          generation_count: 2,
          style_count: 1,
        },
      ],
    });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "users" },
      query: { search: " 100%_a " },
    });

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      id: "user-1",
      authProvider: "entra",
    });
    expect(db.query.mock.calls[0][0]).toContain("ILIKE $2");
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1", "%100\\%\\_a%"]);
    expect(db.query.mock.calls[1][1]).toEqual(["tenant-1", "%100\\%\\_a%", 10, 0]);
  });

  it("lists every user without a keyword filter", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "users" },
      query: {},
    });

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).not.toContain("ILIKE");
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1"]);
    expect(db.query.mock.calls[1][1]).toEqual(["tenant-1", 10, 0]);
  });

  it("returns the auth provider with the filter options", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "user-2",
          email: "bob@example.com",
          display_name: "Bob",
          role: "viewer",
          is_active: true,
          auth_provider: "google",
        },
      ],
    });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "user-options" },
      query: {},
    });

    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ id: "user-2", authProvider: "google" });
  });

  it("filters the history by the creation workflow that produced it", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "history-1",
            has_image: true,
            prompt: "prompt",
            model: "gemini-imagen",
            source: "image-transform",
            created_at: "2026-01-01T00:00:00.000Z",
            user_id: "user-1",
            user_email: "alice@example.com",
            user_display_name: "Alice",
          },
        ],
      });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history" },
      query: { source: "image-transform" },
    });

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ source: "image-transform" });
    expect(db.query.mock.calls[0][0]).toContain("h.source = $2");
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1", "image-transform"]);
  });

  it("filters the history for records saved before the workflow was recorded", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: 0 }] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history" },
      query: { source: "unknown" },
    });

    expect(res.status).toBe(200);
    expect(db.query.mock.calls[0][0]).toContain("h.source IS NULL");
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1"]);
  });

  it("rejects an unsupported history source filter", async () => {
    const res = await invoke({
      method: "GET",
      headers: {},
      params: { resource: "history" },
      query: { source: "pptmaster" },
    });

    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });
});
