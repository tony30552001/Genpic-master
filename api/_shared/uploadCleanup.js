const {
  claimExpiredUploads,
  markUploadExpired,
  releaseUploadCleanupClaim,
} = require("./uploads");
const { deleteStagingBlob } = require("./uploadStorage");

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

const normalizePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const normalizeBatchSize = (value) =>
  Math.min(
    MAX_BATCH_SIZE,
    normalizePositiveInteger(value, DEFAULT_BATCH_SIZE)
  );

const normalizeInterval = (value) =>
  normalizePositiveInteger(value, DEFAULT_INTERVAL_MS);

const isCleanupEnabled = (value = process.env.UPLOAD_CLEANUP_ENABLED) =>
  !["false", "0", "no", "off"].includes(String(value || "").trim().toLowerCase());

const cleanupExpiredUploads = async ({ batchSize, now } = {}) => {
  const limit = normalizeBatchSize(batchSize);
  // `now` is accepted for deterministic orchestration/tests; PostgreSQL's
  // now() remains authoritative for the claim query and lease comparisons.
  void now;

  const claimed = await claimExpiredUploads({ limit });
  const result = {
    claimed: claimed.length,
    expired: 0,
    failed: 0,
    skipped: 0,
  };

  for (const upload of claimed) {
    const uploadId = upload?.id;
    const cleanupClaimedAt = upload?.cleanup_claimed_at;
    if (!uploadId || !cleanupClaimedAt) {
      result.skipped += 1;
      continue;
    }

    try {
      await deleteStagingBlob(uploadId);
      const expired = await markUploadExpired({
        uploadId,
        cleanupClaimedAt,
      });
      if (expired) result.expired += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
      try {
        await releaseUploadCleanupClaim({
          uploadId,
          cleanupClaimedAt,
          errorCode: "blob_delete_failed",
        });
      } catch {
        // Keep the batch moving. The lease will become reclaimable after its
        // timeout even if recording the failure itself encounters an outage.
      }
      console.warn("[upload-cleanup] staging deletion failed", {
        uploadId,
        errorCode: "blob_delete_failed",
      });
    }
  }

  console.info("[upload-cleanup] pass complete", result);
  return result;
};

let cleanupTimer = null;
let cleanupBusy = false;

const runCleanupPass = async ({ batchSize } = {}) => {
  if (cleanupBusy) return null;
  cleanupBusy = true;
  try {
    return await cleanupExpiredUploads({ batchSize });
  } catch {
    console.error("[upload-cleanup] pass failed", {
      errorCode: "cleanup_pass_failed",
    });
    return null;
  } finally {
    cleanupBusy = false;
  }
};

const stopUploadCleanupWorker = () => {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
};

const startUploadCleanupWorker = ({ intervalMs, batchSize } = {}) => {
  if (cleanupTimer || !isCleanupEnabled()) return stopUploadCleanupWorker;

  const pollMs = normalizeInterval(
    intervalMs ?? process.env.UPLOAD_CLEANUP_INTERVAL_MS
  );
  const configuredBatchSize = normalizeBatchSize(
    batchSize ?? process.env.UPLOAD_CLEANUP_BATCH_SIZE
  );

  cleanupTimer = setInterval(() => {
    void runCleanupPass({ batchSize: configuredBatchSize });
  }, pollMs);
  cleanupTimer.unref?.();
  void runCleanupPass({ batchSize: configuredBatchSize });

  return stopUploadCleanupWorker;
};

module.exports = {
  cleanupExpiredUploads,
  isCleanupEnabled,
  normalizeBatchSize,
  startUploadCleanupWorker,
  stopUploadCleanupWorker,
};
