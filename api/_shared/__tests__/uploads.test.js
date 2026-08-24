import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);

const db = require("../db");
db.query = vi.fn();
db.getPool = vi.fn();

const {
  claimExpiredUploads,
  createPendingUpload,
  getOwnedUpload,
  markUploadExpired,
  markUploadReady,
  releaseUploadCleanupClaim,
} = require("../uploads");

const owner = { tenantId: "tenant-1", userId: "user-1" };

describe("owner-scoped upload repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a pending row whose database UUID also forms its staging path", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "upload-1", blob_name: "staging/upload-1" }] });

    await createPendingUpload({
      ...owner,
      purpose: "document",
      originalFileName: "brief.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      expiresAt: "2026-08-25T00:00:00.000Z",
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("WITH candidate AS");
    expect(sql).toContain("SELECT gen_random_uuid() AS id");
    expect(sql).toContain("'staging/' || id::text");
    expect(params).toEqual([
      "tenant-1",
      "user-1",
      "document",
      "brief.pdf",
      "application/pdf",
      42,
      "2026-08-25T00:00:00.000Z",
    ]);
  });

  it("reads an upload only for its owner and requested purpose/status", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const upload = await getOwnedUpload({
      uploadId: "upload-1",
      ...owner,
      purpose: "image",
      status: "ready",
    });

    expect(upload).toBeNull();
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("tenant_id = $2");
    expect(sql).toContain("user_id = $3");
    expect(sql).toContain("purpose = $4");
    expect(sql).toContain("status = $5");
    expect(params).toEqual(["upload-1", "tenant-1", "user-1", "image", "ready"]);
  });

  it("derives the ready blob name while restricting the transition to the same owner", async () => {
    db.query.mockResolvedValue({ rows: [{ id: "upload-1", status: "ready" }] });

    await markUploadReady({
      uploadId: "upload-1",
      ...owner,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("SET status = 'ready'");
    expect(sql).toContain("blob_name = $4");
    expect(sql).toContain("tenant_id = $2");
    expect(sql).toContain("user_id = $3");
    expect(params).toEqual(["upload-1", "tenant-1", "user-1", "ready/upload-1"]);
  });

  it("claims an expiry batch atomically with a skip-locked stale-lease retry", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: "expired-upload",
              cleanup_claimed_at: "2026-08-24T12:00:00.000Z",
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }),
      release: vi.fn(),
    };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });

    const claimed = await claimExpiredUploads({ limit: 7 });

    expect(claimed).toEqual([
      {
        id: "expired-upload",
        cleanup_claimed_at: "2026-08-24T12:00:00.000Z",
      },
    ]);
    expect(client.query.mock.calls[0]).toEqual(["BEGIN"]);
    const [sql, params] = client.query.mock.calls[1];
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("cleanup_claimed_at IS NULL");
    expect(sql).toContain("cleanup_claimed_at < now() - interval '15 minutes'");
    expect(sql).toContain("cleanup_attempts = uploads.cleanup_attempts + 1");
    expect(sql).toContain("LIMIT $1");
    expect(params).toEqual([7]);
    expect(client.query.mock.calls[2]).toEqual(["COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not expire a cleanup claim with a stale timestamp", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const expired = await markUploadExpired({
      uploadId: "upload-1",
      cleanupClaimedAt: "2026-08-24T11:45:00.000Z",
    });

    expect(expired).toBeNull();
    expect(db.query.mock.calls[0][0]).toContain("SET status = 'expired'");
    expect(db.query.mock.calls[0][0]).toContain("cleanup_claimed_at = NULL");
    expect(db.query.mock.calls[0][0]).toContain("cleanup_claimed_at = $2");
    expect(db.query.mock.calls[0][1]).toEqual(["upload-1", "2026-08-24T11:45:00.000Z"]);
  });

  it("does not release a cleanup claim with a stale timestamp", async () => {
    db.query.mockResolvedValue({ rows: [] });

    const released = await releaseUploadCleanupClaim({
      uploadId: "upload-1",
      cleanupClaimedAt: "2026-08-24T11:45:00.000Z",
      errorCode: "blob_delete_failed",
    });

    expect(released).toBeNull();
    expect(db.query).toHaveBeenCalledOnce();
    expect(db.query.mock.calls[0][0]).toContain("last_cleanup_error = $3");
    expect(db.query.mock.calls[0][0]).toContain("cleanup_claimed_at = NULL");
    expect(db.query.mock.calls[0][0]).toContain("cleanup_claimed_at = $2");
    expect(db.query.mock.calls[0][1]).toEqual([
      "upload-1",
      "2026-08-24T11:45:00.000Z",
      "blob_delete_failed",
    ]);
  });

  it("migration binds each upload user to the same tenant", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "db/migrations/020_owner_scoped_uploads.sql"),
      "utf8"
    );

    expect(migration).toContain("UNIQUE (tenant_id, id)");
    expect(migration).toContain("FOREIGN KEY (tenant_id, user_id)");
    expect(migration).toContain("REFERENCES users(tenant_id, id)");
    expect(migration).not.toContain("user_id uuid NOT NULL REFERENCES users(id)");
  });
});
