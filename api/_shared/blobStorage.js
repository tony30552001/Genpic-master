const {
  BlobSASPermissions,
  BlobServiceClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} = require("@azure/storage-blob");

const getGeneratedContainerName = () => process.env.BLOB_CONTAINER_GENERATED || "generated";

const getStorageCredential = () => {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  const key = process.env.AZURE_STORAGE_KEY;
  if (!account || !key) {
    throw new Error("Storage 設定缺失");
  }
  return { account, credential: new StorageSharedKeyCredential(account, key) };
};

/**
 * Signs one blob in the generated container for an external worker such as the
 * video render service. `permissions` is an Azure SAS permission string.
 */
const signGeneratedBlobUrl = ({ blobName, permissions, expiresInMs }) => {
  const { account, credential } = getStorageCredential();
  const containerName = getGeneratedContainerName();
  const sasToken = generateBlobSASQueryParameters(
    {
      containerName,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      protocol: SASProtocol.Https,
      startsOn: new Date(Date.now() - 5 * 60 * 1000),
      expiresOn: new Date(Date.now() + expiresInMs),
    },
    credential
  ).toString();
  const path = blobName.split("/").map(encodeURIComponent).join("/");
  return `https://${account}.blob.core.windows.net/${containerName}/${path}?${sasToken}`;
};

const getContainerClient = async (containerName) => {
  const { account, credential } = getStorageCredential();
  const serviceClient = new BlobServiceClient(
    `https://${account}.blob.core.windows.net`,
    credential
  );
  const containerClient = serviceClient.getContainerClient(containerName);
  await containerClient.createIfNotExists();
  return containerClient;
};

const parseDataUrl = (value) => {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/.exec(value || "");
  if (!match) return null;
  return {
    contentType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
};

const fetchImageSource = async (source) => {
  const dataUrl = parseDataUrl(source);
  if (dataUrl) return dataUrl;

  if (!source || !/^https?:\/\//i.test(source)) {
    throw new Error("圖片來源格式無效");
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`無法下載圖片來源 (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  return {
    contentType: contentType.split(";")[0].trim(),
    buffer: Buffer.from(await response.arrayBuffer()),
  };
};

const uploadGeneratedBlob = async ({ blobName, buffer, contentType }) => {
  const containerName = process.env.BLOB_CONTAINER_GENERATED || "generated";
  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);

  await blobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: "private, max-age=300",
    },
  });

  return { blobName, contentType };
};

const downloadGeneratedBlob = async ({ blobName }) => {
  const containerName = process.env.BLOB_CONTAINER_GENERATED || "generated";
  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);
  return blobClient.downloadToBuffer();
};

const uploadGeneratedStream = async ({ blobName, stream, contentType, contentLength }) => {
  const containerName = process.env.BLOB_CONTAINER_GENERATED || "generated";
  const containerClient = await getContainerClient(containerName);
  const blobClient = containerClient.getBlockBlobClient(blobName);
  const readable = typeof stream.getReader === "function"
    ? require("node:stream").Readable.fromWeb(stream)
    : stream;
  await blobClient.uploadStream(readable, 4 * 1024 * 1024, 5, {
    blobHTTPHeaders: {
      blobContentType: contentType,
      blobCacheControl: "private, max-age=300",
    },
  });
  const properties = await blobClient.getProperties();
  return {
    blobName,
    contentType,
    size: Number(properties.contentLength) || contentLength || 0,
  };
};

const getGeneratedBlobDownload = async ({ blobName }) => {
  const containerName = process.env.BLOB_CONTAINER_GENERATED || "generated";
  const containerClient = await getContainerClient(containerName);
  return containerClient.getBlockBlobClient(blobName).download();
};

const uploadGeneratedImage = async ({ blobName, source }) => {
  const { buffer, contentType } = await fetchImageSource(source);
  return uploadGeneratedBlob({ blobName, buffer, contentType });
};

const downloadGeneratedImage = async ({ blobName }) => downloadGeneratedBlob({ blobName });

module.exports = {
  downloadGeneratedBlob,
  downloadGeneratedImage,
  fetchImageSource,
  getGeneratedBlobDownload,
  signGeneratedBlobUrl,
  uploadGeneratedBlob,
  uploadGeneratedImage,
  uploadGeneratedStream,
};
