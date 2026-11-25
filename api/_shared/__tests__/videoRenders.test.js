import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const videoRenderClient = require("../videoRenderClient");

db.query = vi.fn();
db.getPool = vi.fn();
videoRenderClient.concatSegments = vi.fn();
videoRenderClient.isConfigured = vi.fn();

const { processNextVideoRender } = require("../videoRenders");
const { requestVideoRender, resolveProjectVideo } = require("../videoProjects");
const { VideoRenderError } = videoRenderClient;

const claim = (render) => {
  const claimed = {
    id: "r1",
    project_id: "p1",
    status: "processing",
    attempts: 1,
    lock_version: 3,
    ...render,
  };
  db.getPool.mockReturnValue({
    connect: async () => ({
      query: async (sql) => ({ rows: sql.includes("RETURNING renders.*") ? [claimed] : [] }),
      release: () => {},
    }),
  });
};

const respond = (routes) =>
  db.query.mockImplementation(async (sql) => {
    const route = routes.find(([pattern]) => sql.includes(pattern));
    return route ? route[1] : { rowCount: 1, rows: [] };
  });

const lastUpdate = () => db.query.mock.calls.at(-1);

const succeededSegments = {
  rows: [
    { status: "succeeded", result_blob_name: "videos/jobs/a/1.mp4" },
    { status: "succeeded", result_blob_name: "videos/jobs/b/1.mp4" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  videoRenderClient.isConfigured.mockReturnValue(true);
});

describe("video render worker", () => {
  it("joins the segments into a blob named by the lock and records it under that lock", async () => {
    claim();
    respond([["FROM video_generation_jobs", succeededSegments]]);
    videoRenderClient.concatSegments.mockResolvedValue({
      blobName: "videos/projects/p1/r1-3.mp4",
      sizeBytes: 2048,
      durationSeconds: 20,
    });

    await processNextVideoRender();

    expect(videoRenderClient.concatSegments).toHaveBeenCalledWith({
      segmentBlobNames: ["videos/jobs/a/1.mp4", "videos/jobs/b/1.mp4"],
      outputBlobName: "videos/projects/p1/r1-3.mp4",
    });
    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain("lock_version = $2");
    expect(values).toEqual(["r1", 3, "videos/projects/p1/r1-3.mp4", 2048, 20]);
  });

  it("requeues a retryable failure while attempts remain", async () => {
    claim({ attempts: 2 });
    respond([["FROM video_generation_jobs", succeededSegments]]);
    videoRenderClient.concatSegments.mockRejectedValue(
      new VideoRenderError("影片組合服務逾時未回應", "video_render_timeout", { retryable: true })
    );

    await processNextVideoRender();

    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'queued'");
    expect(values).toEqual(["r1", 3, 15]);
  });

  it("fails a retryable failure on the last attempt", async () => {
    claim({ attempts: 3 });
    respond([["FROM video_generation_jobs", succeededSegments]]);
    videoRenderClient.concatSegments.mockRejectedValue(
      new VideoRenderError("影片組合服務逾時未回應", "video_render_timeout", { retryable: true })
    );

    await processNextVideoRender();

    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'failed'");
    expect(values).toEqual(["r1", 3, "video_render_timeout", "影片組合服務逾時未回應"]);
  });

  it("fails without calling the service when a segment is not finished", async () => {
    claim();
    respond([
      [
        "FROM video_generation_jobs",
        { rows: [succeededSegments.rows[0], { status: "failed", result_blob_name: null }] },
      ],
    ]);

    await processNextVideoRender();

    expect(videoRenderClient.concatSegments).not.toHaveBeenCalled();
    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'failed'");
    expect(values).toEqual(["r1", 3, "segments_not_ready", "影片段落尚未全部完成，無法合併"]);
  });
});

describe("requestVideoRender", () => {
  const owner = { projectId: "p1", tenantId: "t", userId: "u" };
  const project = (statuses) =>
    respond([
      ["FROM video_projects", { rows: [{ id: "p1", model_key: "kling", storyboard: {}, created_at: "now" }] }],
      [
        "FROM video_generation_jobs",
        { rows: statuses.map((status, index) => ({ id: `j${index}`, segment_index: index, status })) },
      ],
      ["FROM video_renders", { rows: [{ id: "r1", status: "queued", completed_at: null }] }],
    ]);

  it("queues one render per project and returns the live one", async () => {
    project(["succeeded", "succeeded"]);

    await expect(requestVideoRender(owner)).resolves.toEqual({
      renderId: "r1",
      status: "queued",
      completedAt: null,
    });
    const insert = db.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO video_renders"));
    expect(insert[0]).toContain("ON CONFLICT (project_id) WHERE status <> 'failed' DO NOTHING");
    expect(insert[1]).toEqual(["t", "u", "p1"]);
  });

  it("refuses single-segment and unfinished projects", async () => {
    project(["succeeded"]);
    await expect(requestVideoRender(owner)).rejects.toMatchObject({ code: "render_not_needed", status: 400 });

    project(["succeeded", "processing"]);
    await expect(requestVideoRender(owner)).rejects.toMatchObject({ code: "not_ready", status: 409 });
  });

  it("refuses when the render service is not configured", async () => {
    project(["succeeded", "succeeded"]);
    videoRenderClient.isConfigured.mockReturnValue(false);

    await expect(requestVideoRender(owner)).rejects.toMatchObject({
      code: "video_render_unconfigured",
      status: 503,
    });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO video_renders"))).toBe(false);
  });
});

describe("resolveProjectVideo", () => {
  it("uses the only segment of a single-segment project", async () => {
    respond([
      ["FROM video_projects", { rows: [{ id: "p1" }] }],
      [
        "FROM video_generation_jobs",
        { rows: [{ status: "succeeded", result_blob_name: "v.mp4", result_mime_type: null, result_size_bytes: 9 }] },
      ],
    ]);

    await expect(resolveProjectVideo({ projectId: "p1", tenantId: "t", userId: "u" })).resolves.toEqual({
      blobName: "v.mp4",
      contentType: "video/mp4",
      sizeBytes: 9,
    });
  });

  it("uses the succeeded render of a multi-segment project, or nothing before it", async () => {
    const segments = { rows: [{ status: "succeeded" }, { status: "succeeded" }] };
    respond([
      ["FROM video_projects", { rows: [{ id: "p1" }] }],
      ["FROM video_generation_jobs", segments],
      ["FROM video_renders", { rows: [{ result_blob_name: "joined.mp4", result_size_bytes: 20 }] }],
    ]);
    await expect(resolveProjectVideo({ projectId: "p1", tenantId: "t" })).resolves.toEqual({
      blobName: "joined.mp4",
      contentType: "video/mp4",
      sizeBytes: 20,
    });
    expect(db.query.mock.calls[0][1]).toEqual(["p1", "t", null]);

    respond([
      ["FROM video_projects", { rows: [{ id: "p1" }] }],
      ["FROM video_generation_jobs", segments],
      ["FROM video_renders", { rows: [] }],
    ]);
    await expect(resolveProjectVideo({ projectId: "p1", tenantId: "t" })).resolves.toBeNull();
  });

  it("rejects a project the caller cannot see", async () => {
    respond([["FROM video_projects", { rows: [] }]]);

    await expect(resolveProjectVideo({ projectId: "p1", tenantId: "t", userId: "u" })).rejects.toMatchObject({
      code: "not_found",
      status: 404,
    });
  });
});
