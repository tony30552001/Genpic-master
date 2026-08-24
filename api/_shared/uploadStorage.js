const {
  BlobServiceClient,
  BlobSASPermissions,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");

const PURPOSE_LIMITS = Object.freeze({
  document: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
});
const UPLOAD_SAS_TTL_MS = 15 * 60 * 1000;
const COPY_POLL_INTERVAL_MS = 200;
const COPY_POLL_ATTEMPTS = 150;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const canonicalUploadId = (uploadId) => {
  if (typeof uploadId !== "string" || !UUID_PATTERN.test(uploadId)) {
    throw new Error("uploadId must be a UUID");
  }
  return uploadId.toLowerCase();
};

const getUploadContainerName = () => process.env.BLOB_CONTAINER_UPLOADS || "uploads";

const buildStagingBlobName = (uploadId) => `staging/${canonicalUploadId(uploadId)}`;

const buildReadyBlobName = (uploadId) => `ready/${canonicalUploadId(uploadId)}`;

const maxBytesForPurpose = (purpose) => PURPOSE_LIMITS[purpose] || null;

const getStorageCredential = () => {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  if (!account || !key) throw new Error("Storage 設定缺失");
  return { account, credential: new StorageSharedKeyCredential(account, key) };
};

const getUploadContainerClient = () => {
  const { account, credential } = getStorageCredential();
  const serviceClient = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential);
  return { account, credential, containerClient: serviceClient.getContainerClient(getUploadContainerName()) };
};

const blobUrl = (account, blobName) =>
  `https://${account}.blob.core.windows.net/${getUploadContainerName()}/${blobName}`;

const issueBlobGrant = ({ contentType, permissions, expiresOn, blobName }) => {
  const { account, credential } = getStorageCredential();
  const startsOn = new Date(Date.now() - 5 * 60 * 1000);
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: getUploadContainerName(),
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      protocol: SASProtocol.Https,
      startsOn,
      expiresOn,
      contentType,
    },
    credential
  ).toString();
  return {
    blobName,
    blobUrl: blobUrl(account, blobName),
    sasToken,
    expiresAt: expiresOn.toISOString(),
  };
};

const issueUploadGrant = ({ uploadId, contentType }) => {
  const expiresOn = new Date(Date.now() + UPLOAD_SAS_TTL_MS);
  return issueBlobGrant({
    contentType,
    permissions: "cw",
    expiresOn,
    blobName: buildStagingBlobName(uploadId),
  });
};

const isMissingBlob = (error) => error?.statusCode === 404 || error?.code === "BlobNotFound";

const getOptionalProperties = async (blobClient) => {
  try {
    return await blobClient.getProperties();
  } catch (error) {
    if (isMissingBlob(error)) return null;
    throw error;
  }
};

const getStagedBlobProperties = async ({ uploadId }) => {
  const { containerClient } = getUploadContainerClient();
  return containerClient.getBlockBlobClient(buildStagingBlobName(uploadId)).getProperties();
};

const assertExpectedProperties = (properties, { expectedSizeBytes, expectedContentType }) => {
  if (!properties) throw new Error("Upload blob was not found");
  if (properties.contentLength !== expectedSizeBytes) {
    throw new Error("Upload blob size does not match the pending upload");
  }
  if (properties.contentType !== expectedContentType) {
    throw new Error("Upload blob content type does not match the pending upload");
  }
};

const waitForCompletedCopy = async (destinationBlobClient) => {
  for (let attempt = 0; attempt < COPY_POLL_ATTEMPTS; attempt += 1) {
    const properties = await destinationBlobClient.getProperties();
    const status = String(properties.copyStatus || "success").toLowerCase();
    if (status === "success") return properties;
    if (status === "failed" || status === "aborted") {
      throw new Error(`Blob copy ${status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, COPY_POLL_INTERVAL_MS));
  }
  throw new Error("Blob copy timed out");
};

const sourceReadUrl = ({ account, uploadId }) => {
  const stagingBlobName = buildStagingBlobName(uploadId);
  const expiresOn = new Date(Date.now() + UPLOAD_SAS_TTL_MS);
  const grant = issueBlobGrant({
    uploadId,
    permissions: "r",
    expiresOn,
    blobName: stagingBlobName,
  });
  return `${blobUrl(account, stagingBlobName)}?${grant.sasToken}`;
};

const promoteUpload = async ({ uploadId, expectedSizeBytes, expectedContentType }) => {
  const stagingBlobName = buildStagingBlobName(uploadId);
  const readyBlobName = buildReadyBlobName(uploadId);
  const { account, containerClient } = getUploadContainerClient();
  const sourceBlobClient = containerClient.getBlockBlobClient(stagingBlobName);
  const destinationBlobClient = containerClient.getBlockBlobClient(readyBlobName);
  const expected = { expectedSizeBytes, expectedContentType };

  const existingDestination = await getOptionalProperties(destinationBlobClient);
  if (existingDestination) {
    const completed = await waitForCompletedCopy(destinationBlobClient);
    assertExpectedProperties(completed, expected);
    return { alreadyReady: true, blobName: readyBlobName };
  }

  const sourceProperties = await sourceBlobClient.getProperties();
  assertExpectedProperties(sourceProperties, expected);
  const copySourceUrl = sourceReadUrl({ account, uploadId });

  try {
    await destinationBlobClient.beginCopyFromURL(copySourceUrl, {
      conditions: { ifNoneMatch: "*" },
    });
  } catch (error) {
    const conflictDestination = await getOptionalProperties(destinationBlobClient);
    if (!conflictDestination) throw error;
    const completed = await waitForCompletedCopy(destinationBlobClient);
    assertExpectedProperties(completed, expected);
    return { alreadyReady: true, blobName: readyBlobName };
  }

  const copiedProperties = await waitForCompletedCopy(destinationBlobClient);
  assertExpectedProperties(copiedProperties, expected);
  await sourceBlobClient.deleteIfExists();
  return { alreadyReady: false, blobName: readyBlobName };
};

const assertVerifiedReadyUpload = (upload) => {
  if (!upload || upload.status !== "ready") throw new Error("Upload is not ready");
  const readyBlobName = buildReadyBlobName(upload.id);
  if (upload.blob_name !== readyBlobName) throw new Error("Upload does not reference its canonical ready blob");
  return readyBlobName;
};

const downloadUploadBuffer = async (upload) => {
  const readyBlobName = assertVerifiedReadyUpload(upload);
  const { containerClient } = getUploadContainerClient();
  return containerClient.getBlockBlobClient(readyBlobName).downloadToBuffer();
};

const issueReadGrant = (upload, expiresAt) => {
  const readyBlobName = assertVerifiedReadyUpload(upload);
  const parsedExpiry = new Date(expiresAt);
  if (Number.isNaN(parsedExpiry.valueOf()) || parsedExpiry <= new Date()) {
    throw new Error("Read grant expiry must be in the future");
  }
  return issueBlobGrant({
    contentType: upload.content_type,
    permissions: "r",
    expiresOn: parsedExpiry,
    blobName: readyBlobName,
  });
};

const deleteStagingBlob = async (uploadId) => {
  const { containerClient } = getUploadContainerClient();
  try {
    const result = await containerClient.getBlockBlobClient(buildStagingBlobName(uploadId)).deleteIfExists();
    return { deleted: Boolean(result?.succeeded) };
  } catch (error) {
    if (isMissingBlob(error)) return { deleted: false };
    throw error;
  }
};

module.exports = {
  buildReadyBlobName,
  buildStagingBlobName,
  deleteStagingBlob,
  downloadUploadBuffer,
  getStagedBlobProperties,
  getUploadContainerName,
  issueReadGrant,
  issueUploadGrant,
  maxBytesForPurpose,
  promoteUpload,
};
