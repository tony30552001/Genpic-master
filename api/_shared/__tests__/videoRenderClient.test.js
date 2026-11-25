import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const blobStoragePath = require.resolve("../blobStorage");
const clientPath = require.resolve("../videoRenderClient");
const originalBlobStorage = require(blobStoragePath);

const signGeneratedBlobUrl = vi.fn(
  ({ blobName, permissions }) => `https://acct.blob.core.windows.net/generated/${blobName}?sp=${permissions}`
);

const loadClient = () => {
  require.cache[blobStoragePath].exports = { ...originalBlobStorage, signGeneratedBlobUrl };
  delete require.cache[clientPath];
  return require("../videoRenderClient");
};

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("videoRenderClient.extractLastFrame", () => {
  beforeEach(() => {
    process.env.VIDEO_RENDER_SERVICE_URL = "https://render.example/";
    process.env.VIDEO_RENDER_SERVICE_KEY = "render-key";
    signGeneratedBlobUrl.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    require.cache[blobStoragePath].exports = originalBlobStorage;
    delete process.env.VIDEO_RENDER_SERVICE_URL;
    delete process.env.VIDEO_RENDER_SERVICE_KEY;
  });

  it("sends a read URL for the video and a write URL for the frame", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { contentType: "image/png", width: 1920, height: 1080, sizeBytes: 4096 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadClient().extractLastFrame({
      videoBlobName: "videos/jobs/j1/0.mp4",
      frameBlobName: "videos/jobs/j1/last-frame.png",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://render.example/last-frame");
    expect(init.headers["X-Pixora-Service-Key"]).toBe("render-key");
    expect(JSON.parse(init.body)).toEqual({
      videoUrl: "https://acct.blob.core.windows.net/generated/videos/jobs/j1/0.mp4?sp=r",
      frameUrl: "https://acct.blob.core.windows.net/generated/videos/jobs/j1/last-frame.png?sp=cw",
    });
    expect(result).toEqual({
      blobName: "videos/jobs/j1/last-frame.png",
      contentType: "image/png",
      width: 1920,
      height: 1080,
      sizeBytes: 4096,
    });
  });

  it("surfaces the service error detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(422, { detail: { message: "ffmpeg exited with 1" } }))
    );

    await expect(
      loadClient().extractLastFrame({ videoBlobName: "v.mp4", frameBlobName: "f.png" })
    ).rejects.toThrow("影片組合服務失敗：ffmpeg exited with 1 (422)");
  });

  it("marks 5xx and network failures as retryable but not 4xx", async () => {
    const attempt = async (fetchImpl) => {
      vi.stubGlobal("fetch", fetchImpl);
      return loadClient()
        .extractLastFrame({ videoBlobName: "v.mp4", frameBlobName: "f.png" })
        .catch((caught) => caught);
    };

    expect((await attempt(vi.fn().mockResolvedValue(jsonResponse(503, {})))).retryable).toBe(true);
    expect((await attempt(vi.fn().mockRejectedValue(new TypeError("fetch failed")))).retryable).toBe(true);
    expect((await attempt(vi.fn().mockResolvedValue(jsonResponse(422, {})))).retryable).toBe(false);
  });

  it("joins segments through /render with read URLs in order and a write URL for the output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { contentType: "video/mp4", sizeBytes: 8192, durationSeconds: 20, copied: true })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await loadClient().concatSegments({
      segmentBlobNames: ["a.mp4", "b.mp4"],
      outputBlobName: "videos/projects/p1/r1-1.mp4",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://render.example/render");
    expect(JSON.parse(init.body)).toEqual({
      segmentUrls: [
        "https://acct.blob.core.windows.net/generated/a.mp4?sp=r",
        "https://acct.blob.core.windows.net/generated/b.mp4?sp=r",
      ],
      outputUrl: "https://acct.blob.core.windows.net/generated/videos/projects/p1/r1-1.mp4?sp=cw",
    });
    expect(result).toMatchObject({ blobName: "videos/projects/p1/r1-1.mp4", sizeBytes: 8192, durationSeconds: 20 });
  });

  it("refuses to run without service configuration", async () => {
    delete process.env.VIDEO_RENDER_SERVICE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      loadClient().extractLastFrame({ videoBlobName: "v.mp4", frameBlobName: "f.png" })
    ).rejects.toThrow("VIDEO_RENDER_SERVICE_KEY 尚未設定");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
