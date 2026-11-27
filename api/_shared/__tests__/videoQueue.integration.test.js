import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");
const db = require("../db");
const fal = require("../foundryFal");
const renderer = require("../videoRenderClient");
const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `video_queue_${randomUUID().replaceAll("-", "")}`;
const userId = randomUUID();
const tenantId = randomUUID();
const owner = { tenantId, userId };
const board = (count) => ({
  title: "晨光",
  global: {},
  shots: Array.from({ length: count }, (_, i) => ({
    id: `s${i + 1}`, duration: 3, script: `街景 ${i + 1}`, cut: i > 0,
  })),
});
const modules = ["../videoJobs", "../videoProjects", "../videoRenders", "../videoModels", "../videoPolicy"];
const previousModules = modules.map((name) => require.cache[require.resolve(name)]);
let pool, jobs, projects, renders;

describe.skipIf(!databaseUrl)("video queues on isolated PostgreSQL", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE tenants (id uuid PRIMARY KEY);
      CREATE TABLE users (id uuid PRIMARY KEY, tenant_id uuid NOT NULL, is_active boolean DEFAULT true);
      CREATE TABLE uploads (id uuid PRIMARY KEY);
      CREATE TABLE image_generation_jobs (id uuid PRIMARY KEY);
      CREATE TABLE history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid, user_id uuid,
        image_url text NOT NULL, source text, prompt text, model text, user_script text);
    `);
    for (const migration of [
      "035_video_generation", "036_video_storyboard", "037_video_projects", "038_video_renders",
      "042_video_job_reuse", "043_video_usage", "044_video_queue_controls",
    ]) {
      await pool.query(readFileSync(resolve("db", "migrations", `${migration}.sql`), "utf8"));
    }
    vi.spyOn(db, "query").mockImplementation((sql, args) => pool.query(sql, args));
    vi.spyOn(db, "getPool").mockImplementation(() => pool);
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected network request"); }));
    for (const name of modules) delete require.cache[require.resolve(name)];
    vi.spyOn(require("../videoModels"), "resolveVideoModel").mockResolvedValue({
      family: "kling-v3-pro", maxDurationSeconds: 15, allowAudio: true, deploymentName: "local-test",
    });
    vi.spyOn(fal, "submitVideo").mockImplementation(async () => randomUUID());
    vi.spyOn(fal, "getVideoRequestStatus").mockResolvedValue("IN_PROGRESS");
    vi.spyOn(renderer, "isConfigured").mockReturnValue(true);
    vi.spyOn(renderer, "concatSegments").mockImplementation(async ({ outputBlobName }) => ({
      blobName: outputBlobName, sizeBytes: 10, durationSeconds: 6,
    }));
    jobs = require("../videoJobs");
    projects = require("../videoProjects");
    renders = require("../videoRenders");
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    await pool.query("TRUNCATE tenants, users CASCADE");
    await pool.query("INSERT INTO tenants VALUES ($1)", [tenantId]);
    await pool.query("INSERT INTO users (id, tenant_id, video_enabled) VALUES ($1,$2,true)", [userId, tenantId]);
    await pool.query(`INSERT INTO video_models
      (tenant_id, model_key, label, family, endpoint, deployment_name, api_key_encrypted, max_duration_seconds)
      VALUES ($1, 'kling', 'Test', 'kling-v3-pro', 'unused', 'unused', 'unused', 15)`, [tenantId]);
    await pool.query(`INSERT INTO tenant_video_settings
      (tenant_id, allowed_models, daily_quota_per_user, submits_per_minute)
      VALUES ($1, ARRAY['kling'], 5, 1)`, [tenantId]);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    modules.forEach((name, i) => {
      if (previousModules[i]) require.cache[require.resolve(name)] = previousModules[i];
      else delete require.cache[require.resolve(name)];
    });
    if (pool) {
      try { await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await pool.end(); }
    }
  });

  const create = (count, extra) => projects.createVideoProject({
    ...owner, modelKey: "kling", storyboard: board(count), ...extra,
  });
  const run = (n, action) => Promise.all(Array.from({ length: n }, () => action()));
  const rows = async (sql, params) => (await pool.query(sql, params)).rows;
  const setStoring = () => pool.query(`UPDATE video_generation_jobs SET status = 'processing', phase = 'storing',
    provider_request_id = id::text, next_poll_at = now(), started_at = now(), result_blob_name = id::text
    WHERE status = 'queued'`);

  it("reserves one slot across racing claims, releases only unsent quota, and cannot cancel someone else's project", async () => {
    const { projectId } = await create(3);
    const params = { projectId, ...owner };
    await run(3, jobs.processNextVideoJob);
    expect(fal.submitVideo).toHaveBeenCalledTimes(1);
    expect(await rows("SELECT status, attempts, used_elements FROM video_generation_jobs ORDER BY attempts"))
      .toEqual([
        { status: "queued", attempts: 0, used_elements: null },
        { status: "queued", attempts: 0, used_elements: null },
        { status: "processing", attempts: 1, used_elements: false },
      ]);
    expect(await jobs.getRemainingQuota(owner)).toBe(2);
    await expect(projects.cancelVideoProject({ ...params, userId: randomUUID() })).rejects.toMatchObject({ status: 404 });
    const cancelled = await projects.cancelVideoProject(params);
    expect(cancelled.status).toBe("processing");
    expect(cancelled.segments.map((s) => s.status).sort()).toEqual(["cancelled", "cancelled", "processing"]);
    expect(await projects.cancelVideoProject(params)).toEqual(cancelled);
    expect(await jobs.getRemainingQuota(owner)).toBe(4);
    await expect(projects.retryVideoProject(params)).rejects.toMatchObject({ code: "project_cancelled" });
    await pool.query(`UPDATE video_generation_jobs SET phase = 'storing', result_blob_name = 'saved',
      next_poll_at = now() WHERE provider_request_id IS NOT NULL`);
    await jobs.processNextVideoJob();
    expect((await projects.getVideoProjectForUser(params)).status).toBe("cancelled");
    expect(await rows("SELECT id FROM video_renders")).toEqual([]);
  });

  it("charges rejected POSTs to the sliding window; retries only explicit rejection, never an ambiguous dispatch", async () => {
    const { projectId } = await create(1);
    const rejected = new fal.FoundryFalError("busy", "provider_rate_limited", 429, { retryable: true });
    rejected.providerStatus = 429;
    fal.submitVideo.mockRejectedValueOnce(rejected);
    await jobs.processNextVideoJob();
    await pool.query("UPDATE video_generation_jobs SET available_at = now()");
    await jobs.processNextVideoJob();
    expect(fal.submitVideo).toHaveBeenCalledTimes(1);
    expect(await rows("SELECT status, attempts FROM video_generation_jobs")).toEqual([{ status: "queued", attempts: 1 }]);
    await pool.query("UPDATE video_models SET recent_submit_times = ARRAY[now() - interval '61 seconds']");
    await pool.query("UPDATE video_generation_jobs SET available_at = now()");
    fal.submitVideo.mockRejectedValueOnce(new fal.FoundryFalError("timeout", "video_provider_unavailable", 503, { retryable: true }));
    await jobs.processNextVideoJob();
    expect(await jobs.processNextVideoJob()).toBe(false);
    expect(fal.submitVideo).toHaveBeenCalledTimes(2);
    expect(await rows("SELECT status, error_code FROM video_generation_jobs"))
      .toEqual([{ status: "failed", error_code: "submit_state_lost" }]);
    await expect(projects.cancelVideoProject({ ...owner, projectId })).rejects.toMatchObject({ code: "nothing_to_cancel" });
  });

  it("keeps an accepted request polling if its database acknowledgement is lost", async () => {
    const { projectId } = await create(1);
    db.query.mockImplementationOnce(async (sql, params) => {
      await pool.query(sql, params);
      throw new Error("connection lost after commit");
    });
    await jobs.processNextVideoJob();
    expect(fal.submitVideo).toHaveBeenCalledTimes(1);
    const [saved] = await rows("SELECT status, phase, provider_request_id FROM video_generation_jobs");
    expect(saved).toMatchObject({ status: "processing", phase: "polling", provider_request_id: expect.any(String) });
    await expect(projects.cancelVideoProject({ ...owner, projectId })).rejects.toMatchObject({ code: "nothing_to_cancel" });
    expect(await jobs.getRemainingQuota(owner)).toBe(4);
  });

  it("atomically auto-queues on racing completions and on fully reused admission; publishes history only after a winning render", async () => {
    const { projectId, segments } = await create(2);
    await setStoring();
    await run(2, jobs.processNextVideoJob);
    const params = { ...owner, projectId };
    const original = (await projects.getVideoProjectForUser(params)).render;
    expect(original.status).toBe("queued");
    expect(await run(2, () => projects.requestVideoRender(params))).toEqual([original, original]);
    renderer.concatSegments.mockRejectedValueOnce(new renderer.VideoRenderError("error", "video_render_failed"));
    await renders.processNextVideoRender();
    expect(await rows("SELECT id FROM history")).toEqual([]);
    const retried = await run(2, () => projects.requestVideoRender(params));
    expect(retried[0].renderId).not.toBe(original.renderId);
    expect(retried[1]).toEqual(retried[0]);
    await run(2, renders.processNextVideoRender);
    expect(renderer.concatSegments).toHaveBeenLastCalledWith(expect.objectContaining({
      segmentBlobNames: segments.map((s) => s.jobId),
    }));
    const finished = await projects.requestVideoRender(params);
    expect(finished).toMatchObject({ status: "succeeded", renderId: retried[0].renderId });
    const copy = await create(2, { baseProjectId: projectId });
    expect(copy.segments.every((s) => s.reused)).toBe(true);
    expect(await jobs.getRemainingQuota(owner)).toBe(3);
    expect(await renders.processNextVideoRender()).toBe(true);
    expect(await renders.processNextVideoRender()).toBe(false);
    const history = await rows("SELECT video_project_id, user_script, model, source, prompt FROM history");
    expect(history.map((h) => h.video_project_id).sort()).toEqual([projectId, copy.projectId].sort());
    for (const item of history) {
      expect(item).toMatchObject({ source: "video", user_script: "晨光", model: "kling" });
      expect(item.prompt).toMatch(/街景 1[\s\S]*街景 2/);
    }
  });

  it("stops an expired submitting claim; explicit segment retry can finish the project, but a stale render cannot publish", async () => {
    const { projectId, segments: [first, second] } = await create(2);
    await pool.query(`UPDATE video_generation_jobs SET status = 'succeeded', phase = 'completed',
      result_blob_name = 'first' WHERE id = $1`, [first.jobId]);
    await pool.query(`UPDATE video_generation_jobs SET status = 'processing', phase = 'submitting',
      attempts = 1, locked_at = now() - interval '6 minutes', started_at = now() WHERE id = $1`, [second.jobId]);
    expect(await jobs.processNextVideoJob()).toBe(false);
    expect(await rows("SELECT error_code FROM video_generation_jobs WHERE id = $1", [second.jobId]))
      .toEqual([{ error_code: "submit_state_lost" }]);
    expect(fal.submitVideo).not.toHaveBeenCalled();
    expect(await rows("SELECT id FROM video_renders")).toEqual([]);
    const retried = await projects.retryVideoProject({ ...owner, projectId });
    expect(retried.segments.map((s) => s.status)).toEqual(["succeeded", "queued"]);
    await setStoring();
    await jobs.processNextVideoJob();
    // The first caller finishes after a second worker reclaimed and completed the render.
    renderer.concatSegments.mockImplementationOnce(async ({ outputBlobName }) => {
      await pool.query("UPDATE video_renders SET locked_at = now() - interval '11 minutes'");
      expect(await renders.processNextVideoRender()).toBe(true);
      return { blobName: outputBlobName, sizeBytes: 1, durationSeconds: 1 };
    });
    expect(await renders.processNextVideoRender()).toBe(true);
    const [render] = await rows("SELECT result_blob_name, attempts FROM video_renders");
    expect(render.attempts).toBe(2);
    expect(render.result_blob_name).toMatch(/-2\.mp4$/);
    expect(await rows("SELECT video_project_id FROM history")).toEqual([{ video_project_id: projectId }]);
  });
});
