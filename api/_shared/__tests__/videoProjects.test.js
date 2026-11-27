import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const videoModels = require("../videoModels");
const videoPolicy = require("../videoPolicy");
const videoStoryboard = require("../videoStoryboard");
const videoModelFamilies = require("../videoModelFamilies");
const videoRenderClient = require("../videoRenderClient");

db.query = vi.fn();
videoModels.withVideoModelTransaction = vi.fn();
videoModels.resolveVideoModel = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();
videoStoryboard.normalizeStoryboard = vi.fn((storyboard) => storyboard);
videoStoryboard.planSegments = vi.fn();
videoModelFamilies.validateVideoOptions = vi.fn(({ durationSeconds }) => ({
  durationSeconds, resolution: "1080p", aspectRatio: "16:9", generateAudio: false,
}));
videoRenderClient.isConfigured = vi.fn(() => true);

const { createVideoProject, retryVideoProject } = require("../videoProjects");

const transaction = ({ failed = 1, admitted = 0, unlimited = false } = {}) => {
  const client = {
    query: vi.fn(async (sql) => {
      if (sql.includes("FROM video_projects")) return { rows: [{ model_key: "kling" }] };
      if (sql.includes("FROM users")) return { rows: [{ video_enabled: true, video_unlimited: unlimited }] };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: admitted }] };
      if (sql.includes("status = 'failed'\n       FOR UPDATE")) {
        return { rows: Array.from({ length: failed }, (_, index) => ({ id: `j${index}` })) };
      }
      return { rows: [], rowCount: failed };
    }),
  };
  videoModels.withVideoModelTransaction.mockImplementation(async (_tenantId, action) => action(client));
  return client;
};

const retry = () => retryVideoProject({ projectId: "p1", tenantId: "t", userId: "u" });

beforeEach(() => {
  vi.clearAllMocks();
  videoPolicy.ensureVideoSettings.mockResolvedValue({ allowedModels: ["kling"], dailyQuotaPerUser: 10 });
  db.query.mockResolvedValue({ rows: [] });
});

describe("retryVideoProject", () => {
  it("requeues only the failed segments as fresh work", async () => {
    const client = transaction({ failed: 2 });
    await retry();
    const update = client.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE video_generation_jobs"));
    expect(update[0]).toContain("WHERE project_id = $1 AND status = 'failed'");
    expect(update[0]).toContain("status = 'queued', phase = 'queued'");
    expect(update[0]).toContain("provider_request_id = NULL");
    expect(update[0]).toContain("created_at = now(), started_at = NULL");
    expect(update[0]).toContain("lock_version = lock_version + 1");
    expect(update[1]).toEqual(["p1"]);
  });

  it("rejects a project without failed segments", async () => {
    transaction({ failed: 0 });
    await expect(retry()).rejects.toMatchObject({ code: "nothing_to_retry", status: 409 });
  });

  it("charges the retried segments against today's quota", async () => {
    const client = transaction({ failed: 3, admitted: 8 });
    await expect(retry()).rejects.toMatchObject({ code: "video_quota_exceeded" });
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE video_generation_jobs"))).toBe(false);
  });

  it("lets an unlimited user retry past the quota", async () => {
    transaction({ failed: 3, admitted: 10, unlimited: true });
    await expect(retry()).resolves.toBeNull();
  });
});

const BASE_PROJECT = "11111111-1111-4111-8111-111111111111";

// Three chained segments; `reusable` maps a segment prompt to the base job
// that has exactly the same request.
const admission = ({ reusable = {}, admitted = 0 } = {}) => {
  videoStoryboard.planSegments.mockReturnValue([0, 1, 2].map((index) => ({
    index,
    mode: index ? "i2v" : "t2v",
    chained: index > 0,
    durationSeconds: 5,
    startFrameUploadId: null,
    storyboard: { shot: index },
    compiled: { storedPrompt: `p${index}`, elements: [] },
  })));
  let created = 0;
  const client = {
    query: vi.fn(async (sql, values) => {
      if (sql.includes("FROM users")) return { rows: [{ video_enabled: true, video_unlimited: false }] };
      if (sql.includes("COUNT(*)")) return { rows: [{ count: admitted }] };
      if (sql.includes("JOIN video_projects projects")) {
        return { rows: reusable[values[5]] ? [{ id: reusable[values[5]] }] : [] };
      }
      if (sql.includes("INSERT INTO video_projects")) return { rows: [{ id: "np" }] };
      if (sql.includes("INSERT INTO video_generation_jobs")) {
        created += 1;
        return { rows: [{ id: `n${created}`, status: sql.includes("SELECT tenant_id") ? "succeeded" : "queued" }] };
      }
      return { rows: [] };
    }),
  };
  videoModels.withVideoModelTransaction.mockImplementation(async (_tenantId, action) => action(client));
  return client;
};

const create = () => createVideoProject({
  tenantId: "t", userId: "u", modelKey: "kling", storyboard: {}, baseProjectId: BASE_PROJECT,
});

const reuseLookups = (client) => client.query.mock.calls.filter(([sql]) => sql.includes("JOIN video_projects projects"));

describe("createVideoProject reuse", () => {
  it("copies unchanged segments as succeeded without charging the quota", async () => {
    const client = admission({ reusable: { p0: "b0", p1: "b1", p2: "b2" }, admitted: 10 });
    const result = await create();
    expect(result.segments.map((segment) => [segment.status, segment.reusedFromJobId])).toEqual([
      ["succeeded", "b0"], ["succeeded", "b1"], ["succeeded", "b2"],
    ]);
    expect(client.query.mock.calls.some(([sql]) => sql.includes("COUNT(*)"))).toBe(false);
    const copies = client.query.mock.calls.filter(([sql]) => sql.includes("reused_from_job_id"));
    expect(copies.map(([, values]) => values)).toEqual([
      ["b0", "np", 0, null], ["b1", "np", 1, "n1"], ["b2", "np", 2, "n2"],
    ]);
    expect(reuseLookups(client).map(([, values]) => values[15])).toEqual([null, "b0", "b1"]);
  });

  it("regenerates the segments chained after a changed one and charges only those", async () => {
    const client = admission({ reusable: { p0: "b0", p2: "b2" }, admitted: 9 });
    await expect(create()).rejects.toMatchObject({
      code: "video_quota_exceeded",
      message: "這支影片需要 2 段，今日影片額度只剩 1 段",
    });
    expect(reuseLookups(client)).toHaveLength(2);
  });

  it("rejects a malformed base project id", async () => {
    await expect(createVideoProject({
      tenantId: "t", userId: "u", modelKey: "kling", storyboard: {}, baseProjectId: "nope",
    })).rejects.toThrow("原影片專案識別碼格式無效");
  });
});