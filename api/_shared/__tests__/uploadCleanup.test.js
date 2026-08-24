import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const uploads = require("../uploads");
const uploadStorage = require("../uploadStorage");
uploads.claimExpiredUploads = vi.fn();
uploads.markUploadExpired = vi.fn();
uploads.releaseUploadCleanupClaim = vi.fn();
uploadStorage.deleteStagingBlob = vi.fn();

// Intentionally loaded before implementation during the RED phase.
const {
  cleanupExpiredUploads,
  startUploadCleanupWorker,
  stopUploadCleanupWorker,
} = require("../uploadCleanup");

const lease = "2026-08-24T03:00:00.000Z";
const claim = (id) => ({ id, cleanup_claimed_at: lease });

describe("bounded upload cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopUploadCleanupWorker();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    uploads.claimExpiredUploads.mockResolvedValue([]);
    uploads.markUploadExpired.mockResolvedValue({});
    uploads.releaseUploadCleanupClaim.mockResolvedValue({});
    uploadStorage.deleteStagingBlob.mockResolvedValue({ deleted: true });
  });

  afterEach(() => {
    stopUploadCleanupWorker();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uses a default batch of 100 and caps caller configuration at 500", async () => {
    await cleanupExpiredUploads({ now: new Date(lease) });
    expect(uploads.claimExpiredUploads).toHaveBeenCalledWith({ limit: 100 });

    await cleanupExpiredUploads({ batchSize: 1000, now: new Date(lease) });
    expect(uploads.claimExpiredUploads).toHaveBeenLastCalledWith({ limit: 500 });
  });

  it("deletes canonical staging blobs and expires rows after success or not-found", async () => {
    uploads.claimExpiredUploads.mockResolvedValueOnce([claim("upload-1"), claim("upload-2")]);
    uploadStorage.deleteStagingBlob
      .mockResolvedValueOnce({ deleted: true })
      .mockResolvedValueOnce({ deleted: false });

    await expect(cleanupExpiredUploads({ batchSize: 100 })).resolves.toEqual({
      claimed: 2,
      expired: 2,
      failed: 0,
      skipped: 0,
    });
    expect(uploadStorage.deleteStagingBlob).toHaveBeenNthCalledWith(1, "upload-1");
    expect(uploadStorage.deleteStagingBlob).toHaveBeenNthCalledWith(2, "upload-2");
    expect(uploads.markUploadExpired).toHaveBeenNthCalledWith(1, {
      uploadId: "upload-1",
      cleanupClaimedAt: lease,
    });
    expect(uploads.markUploadExpired).toHaveBeenNthCalledWith(2, {
      uploadId: "upload-2",
      cleanupClaimedAt: lease,
    });
  });

  it("releases a failed deletion lease with a stable code and continues the batch", async () => {
    uploads.claimExpiredUploads.mockResolvedValueOnce([claim("upload-1"), claim("upload-2")]);
    uploadStorage.deleteStagingBlob
      .mockRejectedValueOnce(new Error("secret-account https://storage.example/sig=secret"))
      .mockResolvedValueOnce({ deleted: true });

    await expect(cleanupExpiredUploads({ batchSize: 100 })).resolves.toEqual({
      claimed: 2,
      expired: 1,
      failed: 1,
      skipped: 0,
    });
    expect(uploads.releaseUploadCleanupClaim).toHaveBeenCalledWith({
      uploadId: "upload-1",
      cleanupClaimedAt: lease,
      errorCode: "blob_delete_failed",
    });
    expect(uploads.markUploadExpired).toHaveBeenCalledWith({
      uploadId: "upload-2",
      cleanupClaimedAt: lease,
    });
    expect(console.warn.mock.calls.flat().join(" ")).not.toContain("secret-account");
    expect(console.warn.mock.calls.flat().join(" ")).not.toContain("sig=secret");
  });

  it("does not overlap worker passes, unrefs the timer, and stops scheduling after shutdown", async () => {
    vi.useFakeTimers();
    let finishFirst;
    uploads.claimExpiredUploads.mockImplementationOnce(
      () => new Promise((resolve) => { finishFirst = resolve; })
    );

    startUploadCleanupWorker({ intervalMs: 10, batchSize: 2 });
    expect(uploads.claimExpiredUploads).toHaveBeenCalledTimes(1);
    const timer = vi.getTimerCount();
    expect(timer).toBe(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(uploads.claimExpiredUploads).toHaveBeenCalledTimes(1);

    finishFirst([]);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);
    expect(uploads.claimExpiredUploads).toHaveBeenCalledTimes(2);

    stopUploadCleanupWorker();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(uploads.claimExpiredUploads).toHaveBeenCalledTimes(2);
  });
});
