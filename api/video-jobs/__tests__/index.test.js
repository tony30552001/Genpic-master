import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const jobs = require("../../_shared/videoJobs");
const blobs = require("../../_shared/blobStorage");
const uploads = require("../../_shared/imageUploads");
const owner = { tenantId: "tenant", userId: "creator" };
const id = "11111111-1111-4111-8111-111111111111";
require("../../_shared/auth").requireAuth = vi.fn(async () => ({ user: {} }));
require("../../_shared/identity").resolveIdentity = vi.fn(async () => owner);
require("../../_shared/rateLimit").rateLimit = vi.fn(() => ({ limited: false }));
jobs.getVideoJobForUser = vi.fn();
jobs.previousFrameBlobName = vi.fn();
blobs.signGeneratedBlobUrl = vi.fn();
blobs.getGeneratedBlobDownload = vi.fn();
blobs.downloadGeneratedImage = vi.fn();
uploads.createReadyImageUpload = vi.fn();
const handler = require("../index");

const invoke = async (method, action) => {
  const context = {};
  await handler(context, { method, params: { id, action }, headers: {} });
  return context.res;
};

beforeEach(() => {
  vi.clearAllMocks();
  jobs.getVideoJobForUser.mockResolvedValue({ status: "succeeded", result_blob_name: "owned.mp4" });
});

describe("owned video segment assets", () => {
  it("signs a short read-only playback URL without opening the MP4", async () => {
    blobs.signGeneratedBlobUrl.mockReturnValue("signed-url");
    const response = await invoke("GET", "playback");
    expect(response).toMatchObject({ status: 200, headers: { "Cache-Control": "no-store" }, body: { url: "signed-url" } });
    expect(blobs.signGeneratedBlobUrl).toHaveBeenCalledWith({ blobName: "owned.mp4", permissions: "r", expiresInMs: 3600000 });
    expect(blobs.getGeneratedBlobDownload).not.toHaveBeenCalled();
  });

  it.each([["GET", "playback"], ["POST", "last-frame"]])("requires ownership and success before %s %s", async (method, action) => {
    jobs.getVideoJobForUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ status: "processing" });
    expect((await invoke(method, action)).status).toBe(404);
    expect((await invoke(method, action)).status).toBe(409);
    expect(jobs.getVideoJobForUser).toHaveBeenCalledWith({ jobId: id, ...owner });
    expect(blobs.signGeneratedBlobUrl).not.toHaveBeenCalled();
    expect(jobs.previousFrameBlobName).not.toHaveBeenCalled();
  });

  it("turns the server-side final frame into an owned PNG upload with a small preview", async () => {
    const buffer = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#415570" } }).png().toBuffer();
    jobs.previousFrameBlobName.mockResolvedValue("last.png");
    blobs.downloadGeneratedImage.mockResolvedValue(buffer);
    uploads.createReadyImageUpload.mockResolvedValue("next-start");
    const response = await invoke("POST", "last-frame");
    expect(jobs.previousFrameBlobName).toHaveBeenCalledWith(id);
    expect(blobs.downloadGeneratedImage).toHaveBeenCalledWith({ blobName: "last.png" });
    expect(uploads.createReadyImageUpload).toHaveBeenCalledWith({ ...owner, buffer, contentType: "image/png", fileName: "last-frame.png" });
    expect(response).toMatchObject({ status: 201, body: { uploadId: "next-start" } });
    const metadata = await sharp(Buffer.from(response.body.previewUrl.split(",")[1], "base64")).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 240, height: 135 });
  });
});
