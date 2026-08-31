import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const blobStorage = require("../blobStorage");
const gptImage = require("../gptImage");
const imageUploads = require("../imageUploads");

db.query = vi.fn();
db.getPool = vi.fn();
blobStorage.uploadGeneratedImage = vi.fn();
gptImage.editGptImage = vi.fn();
gptImage.generateGptImage = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();

const { createImageJob, processNextImageJob } = require("../imageJobs");

describe("durable image jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists edit jobs with their owner-scoped source upload", async () => {
    db.query.mockResolvedValue({
      rows: [
        {
          id: "job-1",
          status: "queued",
          model: "gpt-image-2",
          operation: "edit",
        },
      ],
    });

    await createImageJob({
      tenantId: "tenant-1",
      userId: "user-1",
      model: "gpt-image-2",
      prompt: "make it blue",
      aspectRatio: "1:1",
      quality: "medium",
      operation: "edit",
      sourceUploadId: "upload-1",
    });

    expect(db.query.mock.calls[0][0]).toContain("source_upload_id");
    expect(db.query.mock.calls[0][1]).toEqual([
      "tenant-1",
      "user-1",
      "gpt-image-2",
      "make it blue",
      "1:1",
      null,
      "medium",
      "edit",
      "upload-1",
    ]);
  });

  it("processes an edit job with the persisted upload", async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [
            {
              id: "job-1",
              tenant_id: "tenant-1",
              user_id: "user-1",
              model: "gpt-image-2",
              operation: "edit",
              source_upload_id: "upload-1",
              prompt: "make it blue",
              aspect_ratio: "1:1",
              image_size: null,
              quality: "medium",
              attempts: 1,
            },
          ],
        })
        .mockResolvedValueOnce({}),
      release: vi.fn(),
    };
    db.getPool.mockReturnValue({
      connect: vi.fn().mockResolvedValue(client),
    });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue({ id: "upload-1" });
    imageUploads.downloadOwnedImage.mockResolvedValue({
      buffer: Buffer.from("source"),
      contentType: "image/png",
    });
    gptImage.editGptImage.mockResolvedValue({
      imageUrl: "data:image/png;base64,cmVzdWx0",
    });
    blobStorage.uploadGeneratedImage.mockResolvedValue({
      blobName: "jobs/job-1.png",
      contentType: "image/png",
    });
    db.query.mockResolvedValue({ rows: [] });

    await expect(processNextImageJob()).resolves.toBe(true);

    expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
      uploadId: "upload-1",
      tenantId: "tenant-1",
      userId: "user-1",
    });
    expect(gptImage.editGptImage).toHaveBeenCalledWith({
      imageBase64: Buffer.from("source").toString("base64"),
      mimeType: "image/png",
      prompt: "make it blue",
      aspectRatio: "1:1",
      quality: "medium",
    });
    expect(gptImage.generateGptImage).not.toHaveBeenCalled();
    expect(db.query.mock.calls.at(-1)[0]).toContain("status = 'succeeded'");
  });
});
