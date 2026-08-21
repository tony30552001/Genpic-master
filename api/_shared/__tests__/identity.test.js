import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const db = require("../db");
db.query = vi.fn();

const { resolveIdentity } = require("../identity");

const user = {
  displayName: "Alice",
  email: "Alice@Example.com",
  preferred_username: "Alice@Example.com",
};

describe("resolveIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reads the user row without writing when it is already up to date", async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ id: "tenant-1" }] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            role: "viewer",
            is_active: true,
            email: "alice@example.com",
            display_name: "Alice",
          },
        ],
      });

    const identity = await resolveIdentity(user);

    expect(identity).toMatchObject({
      tenantId: "tenant-1",
      userId: "user-1",
      role: "viewer",
      isActive: true,
      email: "alice@example.com",
    });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain("SELECT id, role, is_active");
    expect(db.query.mock.calls[1][1]).toEqual(["tenant-1", "alice@example.com"]);
  });

  it("caches the default tenant across calls", async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: "user-1",
          role: "viewer",
          is_active: true,
          email: "alice@example.com",
          display_name: "Alice",
        },
      ],
    });

    await resolveIdentity(user);

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain("SELECT id, role, is_active");
  });

  it("updates the stored row when the display name changed", async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user-1",
            role: "viewer",
            is_active: true,
            email: "alice@example.com",
            display_name: "Old Name",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "user-1", role: "viewer", is_active: true }],
      });

    const identity = await resolveIdentity(user);

    expect(identity.displayName).toBe("Alice");
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.query.mock.calls[1][0]).toContain("INSERT INTO users");
    expect(db.query.mock.calls[1][1]).toEqual([
      "tenant-1",
      "alice@example.com",
      "Alice",
      "viewer",
    ]);
  });
});
