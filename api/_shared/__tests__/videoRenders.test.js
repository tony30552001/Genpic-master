import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const videoRenderClient = require("../videoRenderClient");

db.query = vi.fn();
db.getPool = vi.fn();
videoRenderClient.renderTimeline = vi.fn();
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

const projectRow = {
  rows: [
    {
      id: "p1",
      tenant_id: "t",
      user_id: "u",
      model_key: "minimax",
      model_family: "minimax-hailuo-2.3",
      aspect_ratio: "16:9",
      generate_audio: true,
      storyboard: {
        title: "測試影片",
        global: { subtitles: true, transition: "fade" },
        shots: [
          { id: "s1", source: "generate", duration: 10, onScreenText: ["開場標題"] },
          { id: "s2", source: "generate", duration: 10, onScreenText: [] },
        ],
      },
      narration_assets: {
        s1: {
          blobName: "videos/projects/p1/narration/s1.wav",
          durationSeconds: 3.2,
          characters: 12,
          cues: [{ start: 0, end: 3.1, text: "這是第一幕旁白。" }],
        },
      },
    },
  ],
};

const succeededSegments = {
  rows: [
    { id: "j1", segment_index: 0, status: "succeeded", result_blob_name: "videos/jobs/a/1.mp4", storyboard: { shots: [{ id: "s1", duration: 10, onScreenText: ["開場標題"] }] } },
    { id: "j2", segment_index: 1, status: "succeeded", result_blob_name: "videos/jobs/b/1.mp4", storyboard: { shots: [{ id: "s2", duration: 10, onScreenText: [] }] } },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  videoRenderClient.isConfigured.mockReturnValue(true);
});

describe("video render worker", () => {
  it("builds a timeline render plan, ducks MiniMax audio under narration, and records subtitle metadata under lock", async () => {
    claim();
    respond([
      ["FROM video_projects", projectRow],
      ["FROM video_generation_jobs", succeededSegments],
    ]);
    videoRenderClient.renderTimeline.mockResolvedValue({
      blobName: "videos/projects/p1/r1-3.mp4",
      subtitleBlobName: "videos/projects/p1/r1-3.srt",
      subtitleSizeBytes: 128,
      sizeBytes: 2048,
      durationSeconds: 19.5,
    });

    await processNextVideoRender();

    expect(videoRenderClient.renderTimeline).toHaveBeenCalledWith({
      width: 1920,
      height: 1080,
      fps: 24,
      transition: "fade",
      transitionDuration: 0.5,
      burnSubtitles: true,
      clips: [
        {
          kind: "video",
          blobName: "videos/jobs/a/1.mp4",
          sourceAudio: "duck",
          narrations: [
            {
              blobName: "videos/projects/p1/narration/s1.wav",
              offset: 0,
              cues: [{ start: 0, end: 3.1, text: "這是第一幕旁白。" }],
            },
          ],
          overlays: [{ start: 0, end: 10, lines: ["開場標題"] }],
        },
        {
          kind: "video",
          blobName: "videos/jobs/b/1.mp4",
          sourceAudio: "keep",
          narrations: [],
          overlays: [],
        },
      ],
      outputBlobName: "videos/projects/p1/r1-3.mp4",
      subtitleBlobName: "videos/projects/p1/r1-3.srt",
    });
    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'succeeded'");
    expect(sql).toContain("lock_version = $2");
    expect(values).toEqual([
      "r1",
      3,
      "videos/projects/p1/r1-3.mp4",
      2048,
      19.5,
      "videos/projects/p1/r1-3.srt",
      128,
      12,
    ]);
  });

  it("requeues a retryable failure while attempts remain", async () => {
    claim({ attempts: 2 });
    respond([
      ["FROM video_projects", projectRow],
      ["FROM video_generation_jobs", succeededSegments],
    ]);
    videoRenderClient.renderTimeline.mockRejectedValue(
      new VideoRenderError("影片組合服務逾時未回應", "video_render_timeout", { retryable: true })
    );

    await processNextVideoRender();

    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'queued'");
    expect(values).toEqual(["r1", 3, 15]);
  });

  it("fails a retryable failure on the last attempt", async () => {
    claim({ attempts: 3 });
    respond([
      ["FROM video_projects", projectRow],
      ["FROM video_generation_jobs", succeededSegments],
    ]);
    videoRenderClient.renderTimeline.mockRejectedValue(
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
      ["FROM video_projects", projectRow],
      [
        "FROM video_generation_jobs",
        { rows: [succeededSegments.rows[0], { status: "failed", result_blob_name: null }] },
      ],
    ]);

    await processNextVideoRender();

    expect(videoRenderClient.renderTimeline).not.toHaveBeenCalled();
    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'failed'");
    expect(values).toEqual(["r1", 3, "segments_not_ready", "影片段落尚未全部完成，無法合併"]);
  });
});

describe("requestVideoRender", () => {
  const owner = { projectId: "p1", tenantId: "t", userId: "u" };
  const project = (statuses, latest = null) =>
    respond([
      [
        "FROM video_projects",
        { rows: [{ id: "p1", model_key: "kling", storyboard: {}, needs_render: statuses.length !== 1, created_at: "now" }] },
      ],
      [
        "FROM video_generation_jobs",
        { rows: statuses.map((status, index) => ({
          id: `j${index}`, segment_index: index, status, storyboard: { shots: [] },
        })) },
      ],
      ["FROM video_renders", { rows: latest ? [latest] : [] }],
    ]);

  it("queues one render per project and returns the live one", async () => {
    project(["succeeded", "succeeded"]);
    const respondNormally = db.query.getMockImplementation();
    let inserted = false;
    db.query.mockImplementation(async (sql) => {
      if (sql.includes("INSERT INTO video_renders")) inserted = true;
      if (inserted && sql.includes("FROM video_renders")) {
        return { rows: [{ id: "r1", status: "queued", subtitle_blob_name: null, completed_at: null }] };
      }
      return respondNormally(sql);
    });

    await expect(requestVideoRender(owner)).resolves.toEqual({
      renderId: "r1",
      status: "queued",
      hasSubtitles: false,
      completedAt: null,
    });
    const insert = db.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO video_renders"));
    expect(insert[0]).toContain("ON CONFLICT (project_id) WHERE status <> 'failed' DO NOTHING");
    expect(insert[1]).toEqual(["t", "u", "p1"]);
  });

  it("returns an existing render even when new renders are disabled", async () => {
    project(["succeeded", "succeeded"], { id: "r1", status: "succeeded" });
    videoRenderClient.isConfigured.mockReturnValue(false);
    await expect(requestVideoRender(owner)).resolves.toMatchObject({ renderId: "r1", status: "succeeded" });
    expect(db.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO video_renders"))).toBe(false);
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
