/**
 * Classification rules for blobs left in the uploads container.
 *
 * The container holds two generations of data:
 *
 *   - the owner-scoped upload lifecycle, which only ever writes under the
 *     `staging/` and `ready/` prefixes and is managed by `api/uploads` plus
 *     the cleanup worker in `api/_shared/uploadCleanup.js`;
 *   - flat blobs written by the retired `/api/blob-sas` endpoint, which had no
 *     database row and no deletion path.
 *
 * Anything outside the managed prefixes is a candidate for removal, except for
 * blobs whose name still appears in a stored database value. Matching is done
 * against the raw blob name and its URL-encoded forms so that a stored URL is
 * recognised regardless of how the legacy code encoded it.
 */

const MANAGED_PREFIXES = Object.freeze(["staging/", "ready/"]);

const isManagedBlobName = (name) =>
  typeof name === "string" && MANAGED_PREFIXES.some((prefix) => name.startsWith(prefix));

const blobNameVariants = (name) => {
  const variants = new Set([name]);
  try {
    variants.add(encodeURI(name));
    variants.add(encodeURIComponent(name));
  } catch {
    // A malformed name cannot be encoded; the raw form is still checked.
  }
  return [...variants];
};

/**
 * Split the container listing into blobs that must stay and blobs that can go.
 *
 * A reference counts only when the stored value contains the container path
 * followed by the blob name, so that a short name cannot be matched inside an
 * unrelated longer one.
 *
 * @param {{name: string, contentLength?: number}[]} blobs container listing
 * @param {string[]} referenceTexts stored database values mentioning the container
 * @param {string} containerName the uploads container name
 */
const classifyUploadBlobs = (blobs, referenceTexts, containerName) => {
  const haystack = referenceTexts.join("\n");
  const marker = `/${containerName}/`;
  const managed = [];
  const referenced = [];
  const orphaned = [];

  for (const blob of blobs) {
    const entry = { name: blob.name, bytes: Number(blob.contentLength) || 0 };
    if (isManagedBlobName(blob.name)) {
      managed.push(entry);
      continue;
    }
    const match = blobNameVariants(blob.name).some((variant) =>
      haystack.includes(`${marker}${variant}`)
    );
    if (match) {
      referenced.push(entry);
      continue;
    }
    orphaned.push(entry);
  }

  return { managed, referenced, orphaned };
};

const sumBytes = (entries) => entries.reduce((total, entry) => total + entry.bytes, 0);

const formatMegabytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

const formatClassification = ({ managed, referenced, orphaned }) => {
  const line = (label, entries) =>
    `${label.padEnd(28)} ${String(entries.length).padStart(4)} blobs  ${formatMegabytes(
      sumBytes(entries)
    ).padStart(10)}`;
  return [
    line("managed (staging/, ready/)", managed),
    line("referenced by database", referenced),
    line("orphaned (removable)", orphaned),
  ].join("\n");
};

module.exports = {
  MANAGED_PREFIXES,
  blobNameVariants,
  classifyUploadBlobs,
  formatClassification,
  formatMegabytes,
  isManagedBlobName,
  sumBytes,
};
