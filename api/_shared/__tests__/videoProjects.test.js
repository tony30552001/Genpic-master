import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const videoModels = require("../videoModels");
const videoPolicy = require("../videoPolicy");

db.query = vi.fn();
videoModels.withVideoModelTransaction = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();

const { retryVideoProject } = require("../videoProjects");

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
