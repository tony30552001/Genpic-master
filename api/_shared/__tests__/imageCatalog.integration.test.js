import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;
const tenantId = randomUUID();
const otherTenantId = randomUUID();
const userId = randomUUID();
const schema = `image_catalog_test_${randomUUID().replaceAll("-", "")}`;
const originalEncryptionKey = process.env.SECRET_ENCRYPTION_KEY;
const db = require("../db");
const originalDb = { query: db.query, getPool: db.getPool };
const modulePaths = [require.resolve("../imageModels"), require.resolve("../modelPolicy")];
const originalModules = modulePaths.map((path) => require.cache[path]);
let pool;
let models;
let policy;

const originalModel = {
  modelKey: "gpt-image-2", label: "GPT Image 2", apiType: "azure-openai-images-v1",
  deploymentName: "image-original", endpoint: "https://example.openai.azure.com/openai/v1",
  supportedQualities: ["low", "medium", "high"], defaultQuality: "medium",
};
const flare = {
  ...originalModel, modelKey: "gpt-image-2.5-flare", label: "Flare", deploymentName: "image-flare",
  supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"],
};

integration("image catalog on isolated PostgreSQL schema", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY, tenant_id uuid NOT NULL);
      CREATE TABLE tenant_model_settings (
        tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
        allowed_models text[] NOT NULL DEFAULT ARRAY['gpt-image-2']::text[],
        default_model text NOT NULL DEFAULT 'gpt-image-2',
        updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE image_generation_jobs (
        id uuid PRIMARY KEY, tenant_id uuid, user_id uuid, model text NOT NULL,
        status text NOT NULL, quality text NOT NULL DEFAULT 'medium',
        CONSTRAINT image_generation_jobs_quality_check CHECK (quality IN ('low', 'medium', 'high'))
      );
      CREATE TABLE deck_generation_jobs (id uuid PRIMARY KEY, tenant_id uuid, status text);
      CREATE TABLE history (id uuid PRIMARY KEY);
    `);
    await pool.query("INSERT INTO tenants(id) VALUES ($1), ($2)", [tenantId, otherTenantId]);
    await pool.query("INSERT INTO users(id, tenant_id) VALUES ($1, $2)", [userId, tenantId]);
    await pool.query("INSERT INTO tenant_model_settings(tenant_id) VALUES ($1)", [tenantId]);
    await pool.query(readFileSync(resolve(process.cwd(), "db", "migrations", "026_image_model_catalog.sql"), "utf8"));
    process.env.SECRET_ENCRYPTION_KEY = "12".repeat(32);
    db.query = (text, params) => pool.query(text, params);
    db.getPool = () => pool;
    for (const path of modulePaths) delete require.cache[path];
    models = require("../imageModels");
    policy = require("../modelPolicy");
    await models.createImageModel({ ...originalModel, tenantId, apiKey: "original-test-key", createdBy: userId });
    await models.createImageModel({ ...flare, tenantId, apiKey: "flare-test-key", createdBy: userId });
  });

  afterAll(async () => {
    db.query = originalDb.query;
    db.getPool = originalDb.getPool;
    modulePaths.forEach((path, index) => {
      if (originalModules[index]) require.cache[path] = originalModules[index];
      else delete require.cache[path];
    });
    if (originalEncryptionKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
    else process.env.SECRET_ENCRYPTION_KEY = originalEncryptionKey;
    if (pool) {
      try {
        await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      } finally {
        await pool.end();
      }
    }
  });

  it("keeps the existing policy and initializes new tenants unconfigured", async () => {
    expect(await policy.ensureModelPolicy(tenantId)).toMatchObject({
      allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2",
    });
    expect(await policy.ensureModelPolicy(otherTenantId)).toMatchObject({
      allowedModels: [], defaultModel: null,
    });
  });

  it("stores encrypted secrets and resolves only the owning tenant", async () => {
    const stored = await pool.query("SELECT api_key_encrypted FROM image_models WHERE tenant_id = $1", [tenantId]);
    expect(stored.rows.every(({ api_key_encrypted: value }) => !value.includes("test-key"))).toBe(true);
    expect(await models.resolveImageModel({ tenantId, modelKey: flare.modelKey })).toMatchObject({
      apiKey: "flare-test-key", deploymentName: "image-flare",
    });
    await expect(models.resolveImageModel({ tenantId: otherTenantId, modelKey: flare.modelKey }))
      .rejects.toMatchObject({ status: 503 });
  });

  it("enforces supported capabilities, quality constraints and history references", async () => {
    const jobId = randomUUID();
    await pool.query(
      "INSERT INTO image_generation_jobs(id, tenant_id, user_id, model, status, quality) VALUES ($1, $2, $3, $4, 'succeeded', 'max')",
      [jobId, tenantId, userId, flare.modelKey]
    );
    await pool.query("INSERT INTO history(id, image_job_id) VALUES ($1, $2)", [randomUUID(), jobId]);
    await expect(pool.query(
      "INSERT INTO history(id, image_job_id) VALUES ($1, $2)", [randomUUID(), randomUUID()]
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(
      "UPDATE image_generation_jobs SET quality = 'ultra' WHERE id = $1", [jobId]
    )).rejects.toMatchObject({ code: "23514" });
    await expect(pool.query(
      "UPDATE image_models SET supported_qualities = ARRAY['low'], default_quality = 'max' WHERE tenant_id = $1",
      [tenantId]
    )).rejects.toMatchObject({ code: "23514" });
  });

  it("prevents deleting a model referenced by policy or an admitted deck", async () => {
    await expect(models.deleteImageModel({ tenantId, modelKey: originalModel.modelKey }))
      .rejects.toMatchObject({ status: 409 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT id FROM tenants WHERE id = $1 FOR UPDATE", [tenantId]);
      await client.query(
        "INSERT INTO deck_generation_jobs(id, tenant_id, status, image_model_key) VALUES ($1, $2, 'queued', $3)",
        [randomUUID(), tenantId, flare.modelKey]
      );
      const deletion = expect(models.deleteImageModel({ tenantId, modelKey: flare.modelKey }))
        .rejects.toMatchObject({ status: 409 });
      await client.query("COMMIT");
      await deletion;
    } finally {
      client.release();
    }
  });
});
