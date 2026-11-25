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
