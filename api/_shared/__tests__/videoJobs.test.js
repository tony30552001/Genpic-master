import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const blobStorage = require("../blobStorage");
const foundryFal = require("../foundryFal");
const videoModels = require("../videoModels");
const videoPolicy = require("../videoPolicy");
const videoRenderClient = require("../videoRenderClient");

db.query = vi.fn();
db.getPool = vi.fn();
blobStorage.uploadGeneratedStream = vi.fn();
foundryFal.getVideoRequestStatus = vi.fn();
foundryFal.getVideoResult = vi.fn();
foundryFal.downloadVideoResult = vi.fn();
videoModels.resolveVideoModel = vi.fn();
videoPolicy.ensureVideoSettings = vi.fn();
videoRenderClient.extractLastFrame = vi.fn();

const { processNextVideoJob } = require("../videoJobs");
const { VideoRenderError } = videoRenderClient;

const claim = (job) => {
  const claimed = {
    id: "j1",
    tenant_id: "t",
    user_id: "u",
    model_key: "kling",
    status: "processing",
    lock_version: 2,
    attempts: 1,
    provider_request_id: "r1",
    result_blob_name: null,
    previous_job_id: null,
    ...job,
  };
  db.getPool.mockReturnValue({
    connect: async () => ({
      query: async (sql) => ({ rows: sql.includes("RETURNING jobs.*") ? [claimed] : [] }),
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

beforeEach(() => {
  vi.clearAllMocks();
  videoModels.resolveVideoModel.mockResolvedValue({ family: "kling-v3-pro" });
  videoPolicy.ensureVideoSettings.mockResolvedValue({ submitsPerMinute: 5 });
  foundryFal.getVideoResult.mockResolvedValue({});
  foundryFal.downloadVideoResult.mockResolvedValue({ stream: "stream", size: 10 });
  blobStorage.uploadGeneratedStream.mockResolvedValue({
    blobName: "videos/jobs/j1/2.mp4",
    contentType: "video/mp4",
    size: 10,
  });
});

describe("video job worker", () => {
  it("records the video, then extracts the last frame a chained segment waits on", async () => {
    claim({ phase: "polling" });
    foundryFal.getVideoRequestStatus.mockResolvedValue("COMPLETED");
    respond([["previous_job_id = $1 LIMIT 1", { rows: [{}] }]]);
    videoRenderClient.extractLastFrame.mockResolvedValue({ blobName: "videos/jobs/j1/2-last.png" });

    await processNextVideoJob();

    expect(videoRenderClient.extractLastFrame).toHaveBeenCalledWith({
      videoBlobName: "videos/jobs/j1/2.mp4",
      frameBlobName: "videos/jobs/j1/2-last.png",
    });
    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'succeeded'");
    expect(values).toEqual(["j1", 2, "videos/jobs/j1/2-last.png"]);
  });

  it("retries a failed frame extraction without downloading the video again", async () => {
    claim({ phase: "storing", result_blob_name: "videos/jobs/j1/1.mp4" });
    respond([["previous_job_id = $1 LIMIT 1", { rows: [{}] }]]);
    videoRenderClient.extractLastFrame.mockRejectedValue(
      new VideoRenderError("影片處理服務暫時無法使用", "video_render_failed", { retryable: true })
    );

    await processNextVideoJob();

    expect(foundryFal.getVideoResult).not.toHaveBeenCalled();
    expect(videoRenderClient.extractLastFrame).toHaveBeenCalledWith(
      expect.objectContaining({ videoBlobName: "videos/jobs/j1/1.mp4" })
    );
    const [sql, values] = lastUpdate();
    expect(sql).toContain("phase = 'storing'");
    expect(values).toContain("retrying");
  });

  it("fails a chained segment whose previous frame is missing", async () => {
    claim({ phase: "submitting", mode: "i2v", previous_job_id: "j0", storyboard: {} });
    respond([
      ["submitted_at >= now()", { rows: [{ count: 0 }] }],
      ["SELECT last_frame_blob_name", { rows: [] }],
    ]);

    await processNextVideoJob();

    const [sql, values] = lastUpdate();
    expect(sql).toContain("status = 'failed'");
    expect(values).toEqual(["j1", 2, "previous_frame_missing", "找不到上一段影片的最後一格畫面"]);
  });
});
