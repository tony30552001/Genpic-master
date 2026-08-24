import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationDescribe = testDatabaseUrl ? describe : describe.skip;

if (testDatabaseUrl) {
  process.env.DATABASE_URL = testDatabaseUrl;
}

const require = createRequire(import.meta.url);
const db = require("../db");
const { claimExpiredUploads } = require("../uploads");

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const freshUploadId = "00000000-0000-0000-0000-000000000003";
const staleUploadId = "00000000-0000-0000-0000-000000000004";

integrationDescribe("upload cleanup leasing with PostgreSQL", () => {
  let pool;

  beforeAll(async () => {
    pool = db.getPool();
    await pool.query(`
      CREATE TABLE tenants (
        id uuid PRIMARY KEY,
        name text NOT NULL
      );
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL
      );
      CREATE TABLE deck_generation_jobs (
        id uuid PRIMARY KEY
      );
    `);

    const migration = readFileSync(
      resolve(process.cwd(), "db/migrations/020_owner_scoped_uploads.sql"),
      "utf8"
    );
    await pool.query(migration);

    await pool.query("INSERT INTO tenants (id, name) VALUES ($1, $2)", [tenantId, "test"]);
    await pool.query("INSERT INTO users (id, tenant_id) VALUES ($1, $2)", [userId, tenantId]);
    await pool.query(
      `INSERT INTO uploads (
         id, tenant_id, user_id, purpose, original_file_name, content_type,
         size_bytes, blob_name, status, expires_at, cleanup_claimed_at
       ) VALUES
         ($1, $2, $3, 'document', 'fresh.pdf', 'application/pdf', 1,
          'staging/fresh', 'pending', now() - interval '1 hour', now()),
         ($4, $2, $3, 'document', 'stale.pdf', 'application/pdf', 1,
          'staging/stale', 'pending', now() - interval '1 hour',
          now() - interval '16 minutes')`,
      [freshUploadId, tenantId, userId, staleUploadId]
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`
      DROP TABLE IF EXISTS deck_generation_jobs;
      DROP TABLE IF EXISTS uploads;
      DROP TABLE IF EXISTS users;
      DROP TABLE IF EXISTS tenants;
    `);
    await pool.end();
  });

  it("claims only a stale lease and immediately protects the replacement lease", async () => {
    const firstClaim = await claimExpiredUploads({ limit: 2 });

    expect(firstClaim).toHaveLength(1);
    expect(firstClaim[0]).toMatchObject({ id: staleUploadId });
    expect(firstClaim[0].cleanup_claimed_at).toBeInstanceOf(Date);

    const rows = await pool.query(
      `SELECT id, cleanup_attempts
       FROM uploads
       ORDER BY id`
    );
    expect(rows.rows).toEqual([
      { id: freshUploadId, cleanup_attempts: 0 },
      { id: staleUploadId, cleanup_attempts: 1 },
    ]);

    expect(await claimExpiredUploads({ limit: 2 })).toEqual([]);
  });
});
