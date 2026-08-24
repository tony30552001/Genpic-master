import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");

db.query = vi.fn();
db.getPool = vi.fn();

const {
  createDocumentAnalysisJob,
  getDocumentAnalysisJobForUser,
  claimNextDocumentAnalysisJob,
  processNextDocumentAnalysisJob,
  markDocumentAnalysisJobSucceeded,
  markDocumentAnalysisJobFailure,
} = require("../documentAnalysisJobs");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("document analysis jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.query.mockResolvedValue({
      rows: [{
        id: "job-1",
        status: "queued",
        created_at: "2026-08-24T00:00:00.000Z",
      }],
    });
  });

  it("creates a queued job scoped to the owner and source upload", async () => {
    await createDocumentAnalysisJob({
      ...OWNER,
      sourceUploadId: UPLOAD_ID,
      sceneCount: "auto",
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("document_analysis_jobs");
    expect(sql).toContain("source_upload_id");
    expect(params).toEqual([
      OWNER.tenantId,
      OWNER.userId,
      UPLOAD_ID,
      "auto",
    ]);
  });

  it("loads a job only for its tenant and user", async () => {
    await getDocumentAnalysisJobForUser({
      jobId: "job-1",
      ...OWNER,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("tenant_id = $2");
    expect(sql).toContain("user_id = $3");
    expect(params).toEqual(["job-1", OWNER.tenantId, OWNER.userId]);
  });

  it("claims one available job with a lock-safe queue update", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ rows: [{ id: "job-1", attempts: 1 }] })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });

    const job = await claimNextDocumentAnalysisJob();

    expect(job).toEqual({ id: "job-1", attempts: 1 });
    const sqls = client.query.mock.calls.map(([sql]) => sql);
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls.some((sql) => sql.includes("FOR UPDATE SKIP LOCKED"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("UPDATE document_analysis_jobs"))).toBe(true);
    expect(sqls.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("stores the normalized result when a job succeeds", async () => {
    await markDocumentAnalysisJobSucceeded({
      jobId: "job-1",
      result: { scenes: [{ scene_number: 1 }] },
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'succeeded'");
    expect(params).toEqual(["job-1", JSON.stringify({ scenes: [{ scene_number: 1 }] })]);
  });

  it("records a safe failure message without retrying through the request path", async () => {
    await markDocumentAnalysisJobFailure({
      jobId: "job-1",
      error: { code: "gpt_analysis_error", message: "模型暫時忙碌" },
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'failed'");
    expect(params).toEqual(["job-1", "gpt_analysis_error", "模型暫時忙碌"]);
  });

  it("processes a claimed job and persists the analysis result", async () => {
    const client = {
      query: vi.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [{
            id: "job-1",
            tenant_id: OWNER.tenantId,
            user_id: OWNER.userId,
            source_upload_id: UPLOAD_ID,
            scene_count: "auto",
            attempts: 1,
          }],
        })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    const analyze = vi.fn().mockResolvedValue({ scenes: [{ scene_number: 1 }] });

    await expect(processNextDocumentAnalysisJob({ analyze })).resolves.toBe(true);

    expect(analyze).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      sceneCount: "auto",
      owner: OWNER,
    });
    expect(db.query.mock.calls.at(-1)[1]).toEqual([
      "job-1",
      JSON.stringify({ scenes: [{ scene_number: 1 }] }),
    ]);
  });
});
