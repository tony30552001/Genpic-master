import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const db = require("../../_shared/db");
const originalDb = { ...db };
const reportPath = require.resolve("../videoUsage");
const modelsPath = require.resolve("../../_shared/videoModels");
const tenant = randomUUID(), otherTenant = randomUUID(), alice = randomUUID(), bob = randomUUID(), outsider = randomUUID();
const upload = randomUUID();
const schema = `video_usage_test_${randomUUID().replaceAll("-", "")}`;
const first = "2026-11-26T16:00:00.000Z", nextDay = "2026-11-27T16:00:00.000Z";
const modelInput = {
  family: "kling-v3-pro", maxDurationSeconds: 5, allowAudio: true,
  endpoint: "https://test.services.ai.azure.com/providers/falai/v1", deploymentName: "example",
};
let pool, report, models;

const job = async ({ owner = alice, org = tenant, key = "paid", seconds = 5, mode = "i2v",
  audio = true, elements = true, status = "succeeded", at = first, reused = null, request = "submitted" } = {}) => {
  const result = await pool.query(`
    WITH project AS (
      INSERT INTO video_projects (tenant_id,user_id,model_key,storyboard) VALUES ($1,$2,$3,'{}') RETURNING id
    )
    INSERT INTO video_generation_jobs (project_id,segment_index,tenant_id,user_id,model_key,storyboard,
      prompt,mode,source_upload_id,duration_seconds,result_duration_seconds,generate_audio,used_elements,
      status,completed_at,reused_from_job_id,provider_request_id)
    SELECT id,0,$1,$2,$3,'{}','fixture',$4,$5,$6,9.99,$7,$8,$9,$10,$11,$12 FROM project RETURNING id`,
  [org, owner, key, mode, mode === "i2v" ? upload : null, seconds, audio, elements, status, at, reused, request]);
  return result.rows[0].id;
};

const render = (org, owner, key, seconds, at, status = "succeeded") => pool.query(`
  WITH project AS (
    INSERT INTO video_projects (tenant_id,user_id,model_key,storyboard) VALUES ($1,$2,$3,'{}') RETURNING id
  )
  INSERT INTO video_renders (project_id,tenant_id,user_id,status,completed_at,result_duration_seconds,result_blob_name)
  SELECT id,$1,$2,$4,$5,$6,'output' FROM project`, [org, owner, key, status, at, seconds]);

const read = async (query) => {
  const context = {};
  await report.handleVideoUsage(context, { query }, { tenantId: tenant });
  expect(context.res.status).toBe(200);
  return context.res.body;
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("video usage on isolated PostgreSQL schema", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, display_name text, email text);
      CREATE TABLE uploads (id uuid PRIMARY KEY);
      CREATE TABLE image_generation_jobs (id uuid PRIMARY KEY);
      CREATE TABLE history (id uuid PRIMARY KEY, source text, image_url text NOT NULL);
    `);
    for (const name of ["035_video_generation", "036_video_storyboard", "037_video_projects",
      "038_video_renders", "042_video_job_reuse", "043_video_usage"]) {
      await pool.query(readFileSync(resolve("db", "migrations", `${name}.sql`), "utf8"));
    }
    await pool.query("INSERT INTO tenants VALUES ($1), ($2)", [tenant, otherTenant]);
    await pool.query(`INSERT INTO users (id,tenant_id,display_name,email,video_unlimited) VALUES
      ($1,$2,'Alice','alice@example.test',true),($3,$2,'Bob','bob@example.test',false),
      ($4,$5,'Other','other@example.test',false)`, [alice, tenant, bob, outsider, otherTenant]);
    await pool.query("INSERT INTO uploads VALUES ($1)", [upload]);
    vi.stubEnv("SECRET_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    db.query = pool.query.bind(pool);
    db.getPool = () => pool;
    delete require.cache[modelsPath];
    delete require.cache[reportPath];
    models = require(modelsPath);
    report = require(reportPath);
    for (const [org, key, price] of [[tenant, "paid", 0.123456], [tenant, "free", 0], [otherTenant, "paid", 3]]) {
      await models.createVideoModel({
        ...modelInput, modelKey: key, label: key, pricePerSecondUsd: price, tenantId: org, apiKey: "fixture",
      });
    }
    const original = await job();
    await job(); // A second provider job with identical dimensions.
    await job({ reused: original, request: null });
    await job({ request: null }); // A copy after ON DELETE SET NULL clears its source.
    await job({ status: "failed" });
    await job({ status: "processing" });
    await job({ key: "free", mode: "t2v", audio: false, elements: false, seconds: 3 });
    await job({ key: "deleted", elements: null, seconds: 4 });
    await job({ owner: bob });
    await job({ org: otherTenant, owner: outsider });
    await job({ at: nextDay });
    await job({ at: "2026-11-26T15:59:59.999Z" });
    await render(tenant, alice, "paid", 90.25, first);
    await render(tenant, alice, "paid", 60, nextDay);
    await render(tenant, alice, "deleted", null, first);
    await render(tenant, bob, "paid", 30, first);
    await render(tenant, alice, "paid", 70, first, "failed");
    await render(otherTenant, outsider, "paid", 70, first);
  });

  afterAll(async () => {
    Object.assign(db, originalDb);
    delete require.cache[modelsPath];
    delete require.cache[reportPath];
    vi.unstubAllEnvs();
    if (pool) {
      try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await pool.end(); }
    }
  });

  const dates = { from: "2026-11-27", to: "2026-11-27" };
  it("scopes both workloads and prices to the admin tenant, user, model and inclusive Taiwan day", async () => {
    const data = await read({ ...dates, tenantId: otherTenant, userId: alice, modelKey: "paid" });
    expect(data.rows).toEqual([expect.objectContaining({
      modelKey: "paid", mode: "i2v", usedElements: true, generateAudio: true, durationSeconds: 5,
      videoUnlimited: true, jobCount: 2, generatedSeconds: 10, estimatedCostUsd: 1.23456,
    })]);
    expect(data).toMatchObject({ generatedSeconds: 10, knownCostUsd: 1.23456, renderCount: 1, unknownDurationCount: 0, narrationCharacters: null });
    expect(data.knownOutputMinutes).toBeCloseTo(90.25 / 60);
    const empty = await read({ userId: outsider });
    expect(empty).toMatchObject({ rows: [], generatedSeconds: 0, knownCostUsd: 0, knownOutputMinutes: 0, renderCount: 0 });
    const entireTenant = await read({ ...dates, modelKey: "paid" });
    expect(entireTenant).toMatchObject({ generatedSeconds: 15, knownCostUsd: 1.85184, renderCount: 2 });
    expect(entireTenant.rows.map((row) => row.userId).sort()).toEqual([alice, bob].sort());
  });

  it("keeps unpriced seconds, free work, unobserved elements and missing output lengths distinct", async () => {
    const data = await read({ ...dates, userId: alice });
    expect(data).toMatchObject({ generatedSeconds: 17, knownCostUsd: 1.23456, unpricedSeconds: 4, unknownDurationCount: 1 });
    expect(data.rows).toContainEqual(expect.objectContaining({
      mode: "t2v", durationSeconds: 3, generateAudio: false, usedElements: false, pricePerSecondUsd: 0, estimatedCostUsd: 0,
    }));
    const unknown = await read({ modelKey: "deleted" });
    expect(unknown).toMatchObject({ knownCostUsd: null, knownOutputMinutes: null, unpricedSeconds: 4,
      rows: [expect.objectContaining({ modelKey: "deleted", pricePerSecondUsd: null, estimatedCostUsd: null, usedElements: null })] });
  });

  it("persists price edits, supports clearing a price, and never publishes prices to ordinary profiles", async () => {
    const update = (pricePerSecondUsd) => models.updateVideoModel({ ...modelInput, modelKey: "free", label: "free", tenantId: tenant, pricePerSecondUsd });
    expect((await update(0.000001)).pricePerSecondUsd).toBe(0.000001);
    expect((await read({ modelKey: "free" })).knownCostUsd).toBe(0.000003);
    await expect(update(-1)).rejects.toThrow("每秒單價");
    await expect(update(0.0000001)).rejects.toThrow("每秒單價");
    expect((await update(null)).pricePerSecondUsd).toBeNull();
    expect((await read({ modelKey: "free" })).knownCostUsd).toBeNull();
    for (const model of await models.listPublicVideoModels(tenant)) expect(model).not.toHaveProperty("pricePerSecondUsd");
  });
});
