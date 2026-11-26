import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const db = require("../../_shared/db");
auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
db.query = vi.fn();
const handler = require("../index");

const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const owner = { tenantId: "tenant-1", userId: "user-1" };
const row = {
  id: SESSION_ID, title: "海邊廣告", state: { messages: [] }, state_version: 2,
  created_at: "2026-09-11T00:00:00Z", updated_at: "2026-09-11T00:01:00Z",
};
const invoke = async ({ method, id, body, query } = {}) => {
  const context = {};
  await handler(context, { method, body, query, headers: {}, params: id ? { id } : {} });
  return context.res;
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAuth.mockResolvedValue({ user: { sub: "user" } });
  identity.resolveIdentity.mockResolvedValue(owner);
  rateLimit.rateLimit.mockReturnValue({ limited: false });
});

describe("video sessions", () => {
  it("creates a session from an owned snapshot", async () => {
    db.query.mockResolvedValue({ rows: [row] });
    const res = await invoke({ method: "POST", body: { title: " 海邊廣告 ", state: { messages: [] } } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: SESSION_ID, stateVersion: 2, state: { messages: [] } });
    expect(db.query.mock.calls[0][1]).toEqual(["tenant-1", "user-1", "海邊廣告", { messages: [] }]);
  });

  it.each([
    [{ title: "x", state: [] }, 400],
    [{ title: "x".repeat(41), state: {} }, 400],
    [{ title: "x", state: { blob: "x".repeat(2 * 1024 * 1024) } }, 413],
  ])("rejects an invalid snapshot before touching the database", async (body, status) => {
    expect((await invoke({ method: "POST", body })).status).toBe(status);
    expect(db.query).not.toHaveBeenCalled();
  });

  it("saves only against the current state version", async () => {
    db.query.mockResolvedValueOnce({ rows: [{ ...row, state_version: 3 }] });
    const res = await invoke({
      method: "PUT", id: SESSION_ID, body: { stateVersion: 2, title: "t", state: { turns: [] } },
    });
    expect(res.status).toBe(200);
    expect(res.body.stateVersion).toBe(3);
    expect(db.query.mock.calls[0][1]).toEqual([SESSION_ID, "tenant-1", "user-1", "t", { turns: [] }, 2]);
  });

  it("reports a stale save as a conflict and a missing session as not found", async () => {
    db.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });
    const body = { stateVersion: 1, title: "t", state: {} };
    const conflict = await invoke({ method: "PUT", id: SESSION_ID, body });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("state_conflict");

    db.query.mockResolvedValue({ rows: [] });
    expect((await invoke({ method: "PUT", id: SESSION_ID, body })).status).toBe(404);
    expect((await invoke({ method: "DELETE", id: SESSION_ID })).status).toBe(404);
  });

  it("deletes an owned session", async () => {
    db.query.mockResolvedValue({ rows: [{ id: SESSION_ID }] });
    expect((await invoke({ method: "DELETE", id: SESSION_ID })).status).toBe(204);
    expect(db.query.mock.calls[0][1]).toEqual([SESSION_ID, "tenant-1", "user-1"]);
  });

  it("pages the list with a cursor and rejects malformed IDs", async () => {
    const rows = Array.from({ length: 31 }, (_, i) => ({
      ...row, id: `22222222-2222-4222-8222-${String(i).padStart(12, "0")}`,
      updated_at_key: "2026-09-11 00:01:00+00",
    }));
    db.query.mockResolvedValue({ rows });
    const res = await invoke({ method: "GET" });
    expect(res.body.items).toHaveLength(30);
    expect(res.body.items[0]).toEqual({ id: rows[0].id, title: row.title, updatedAt: row.updated_at });
    const next = await invoke({ method: "GET", query: { cursor: res.body.nextCursor } });
    expect(next.status).toBe(200);
    expect(db.query.mock.calls[1][1].slice(2, 4)).toEqual(["2026-09-11 00:01:00+00", rows[29].id]);
    expect((await invoke({ method: "GET", id: "bad" })).status).toBe(400);
  });
});
