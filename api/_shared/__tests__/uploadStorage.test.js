import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const uploadId = "A0B1C2D3-E4F5-6789-ABCD-0123456789EF";
const canonicalUploadId = uploadId.toLowerCase();

const azure = vi.hoisted(() => {
  const state = { blobs: new Map() };
  const getBlob = vi.fn((name) => state.blobs.get(name));
  const container = { getBlockBlobClient: getBlob };

  return {
    state,
    getBlob,
    container,
    BlobServiceClient: vi.fn(function BlobServiceClient() {
      this.getContainerClient = vi.fn(() => container);
    }),
    StorageSharedKeyCredential: vi.fn(),
    BlobSASPermissions: { parse: vi.fn((value) => value) },
    SASProtocol: { Https: "https" },
    generateBlobSASQueryParameters: vi.fn(() => ({ toString: () => "signed-sas" })),
  };
});

const azureModulePath = require.resolve("@azure/storage-blob");
const uploadStoragePath = require.resolve("../uploadStorage");
const originalAzureExports = require(azureModulePath);

const resetBlobs = () => {
  azure.state.blobs = new Map();
  azure.getBlob.mockImplementation((name) => azure.state.blobs.get(name));
};

const missingBlob = () => Object.assign(new Error("BlobNotFound"), { statusCode: 404 });

const blob = (overrides = {}) => ({
  getProperties: vi.fn(),
  beginCopyFromURL: vi.fn(),
  deleteIfExists: vi.fn().mockResolvedValue({ succeeded: true }),
  downloadToBuffer: vi.fn(),
  ...overrides,
});

describe("fixed-container upload storage", () => {
  beforeEach(() => {
    require.cache[azureModulePath].exports = azure;
    delete require.cache[uploadStoragePath];
    vi.clearAllMocks();
    resetBlobs();
    process.env.AZURE_STORAGE_ACCOUNT = "storage-account";
    process.env.AZURE_STORAGE_KEY = "storage-key";
    process.env.BLOB_CONTAINER_UPLOADS = "private-user-uploads";
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.BLOB_CONTAINER_UPLOADS;
  });

  afterAll(() => {
    require.cache[azureModulePath].exports = originalAzureExports;
    delete require.cache[uploadStoragePath];
  });

  it("uses only the configured upload container and canonical UUID paths", () => {
    const { getUploadContainerName, buildReadyBlobName, buildStagingBlobName } = require("../uploadStorage");

    expect(getUploadContainerName()).toBe("private-user-uploads");
    expect(getUploadContainerName("attacker-controlled-container")).toBe("private-user-uploads");
    expect(buildStagingBlobName(uploadId)).toBe(`staging/${canonicalUploadId}`);
    expect(buildReadyBlobName(uploadId)).toBe(`ready/${canonicalUploadId}`);
    expect(() => buildStagingBlobName("../other-blob")).toThrow(/UUID/i);
    expect(() => buildReadyBlobName("not-a-uuid")).toThrow(/UUID/i);
  });

  it("limits each accepted upload purpose on the server", () => {
    const { maxBytesForPurpose } = require("../uploadStorage");

    expect(maxBytesForPurpose("document")).toBe(50 * 1024 * 1024);
    expect(maxBytesForPurpose("image")).toBe(10 * 1024 * 1024);
    expect(maxBytesForPurpose("archive")).toBeNull();
  });

  it("issues a short HTTPS create-write grant for only the canonical staging blob", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T03:00:00.000Z"));
    const { issueUploadGrant } = require("../uploadStorage");

    const grant = issueUploadGrant({
      uploadId,
      contentType: "application/pdf",
      expiresAt: new Date("2026-08-26T03:00:00.000Z"),
    });

    expect(grant).toMatchObject({
      blobName: `staging/${canonicalUploadId}`,
      blobUrl: `https://storage-account.blob.core.windows.net/private-user-uploads/staging/${canonicalUploadId}`,
      sasToken: "signed-sas",
      expiresAt: "2026-08-24T03:15:00.000Z",
    });
    expect(azure.generateBlobSASQueryParameters).toHaveBeenCalledWith(
      expect.objectContaining({
        containerName: "private-user-uploads",
        blobName: `staging/${canonicalUploadId}`,
        permissions: "cw",
        protocol: "https",
        contentType: "application/pdf",
      }),
      expect.anything()
    );
  });

  it("reads staged properties from the canonical staging blob", async () => {
    const staging = blob({ getProperties: vi.fn().mockResolvedValue({ contentLength: 7 }) });
    azure.state.blobs.set(`staging/${canonicalUploadId}`, staging);
    const { getStagedBlobProperties } = require("../uploadStorage");

    await expect(getStagedBlobProperties({ uploadId })).resolves.toEqual({ contentLength: 7 });
    expect(azure.getBlob).toHaveBeenCalledWith(`staging/${canonicalUploadId}`);
  });

  it("promotes a verified staging blob, waits for copy success, then removes staging", async () => {
    const source = blob({
      getProperties: vi.fn().mockResolvedValue({ contentLength: 7, contentType: "application/pdf" }),
    });
    const destination = blob({
      getProperties: vi
        .fn()
        .mockRejectedValueOnce(missingBlob())
        .mockResolvedValueOnce({ copyStatus: "pending" })
        .mockResolvedValueOnce({ copyStatus: "success", contentLength: 7, contentType: "application/pdf" }),
      beginCopyFromURL: vi.fn().mockResolvedValue({}),
    });
    azure.state.blobs.set(`staging/${canonicalUploadId}`, source);
    azure.state.blobs.set(`ready/${canonicalUploadId}`, destination);
    const { promoteUpload } = require("../uploadStorage");

    const result = await promoteUpload({
      uploadId,
      expectedSizeBytes: 7,
      expectedContentType: "application/pdf",
    });

    expect(result).toEqual({ alreadyReady: false, blobName: `ready/${canonicalUploadId}` });
    expect(destination.beginCopyFromURL).toHaveBeenCalledWith(
      `https://storage-account.blob.core.windows.net/private-user-uploads/staging/${canonicalUploadId}?signed-sas`,
      { conditions: { ifNoneMatch: "*" } }
    );
    expect(source.deleteIfExists).toHaveBeenCalledOnce();
  });

  it("converges a retry on an already-ready verified destination without deleting staging", async () => {
    const source = blob();
    const destination = blob({
      getProperties: vi.fn().mockResolvedValue({
        copyStatus: "success",
        contentLength: 7,
        contentType: "application/pdf",
      }),
    });
    azure.state.blobs.set(`staging/${canonicalUploadId}`, source);
    azure.state.blobs.set(`ready/${canonicalUploadId}`, destination);
    const { promoteUpload } = require("../uploadStorage");

    await expect(
      promoteUpload({ uploadId, expectedSizeBytes: 7, expectedContentType: "application/pdf" })
    ).resolves.toEqual({ alreadyReady: true, blobName: `ready/${canonicalUploadId}` });
    expect(destination.beginCopyFromURL).not.toHaveBeenCalled();
    expect(source.deleteIfExists).not.toHaveBeenCalled();
  });

  it("refuses a pre-existing ready blob whose metadata differs from the pending upload", async () => {
    const source = blob();
    const destination = blob({
      getProperties: vi.fn().mockResolvedValue({
        copyStatus: "success",
        contentLength: 8,
        contentType: "application/pdf",
      }),
    });
    azure.state.blobs.set(`staging/${canonicalUploadId}`, source);
    azure.state.blobs.set(`ready/${canonicalUploadId}`, destination);
    const { promoteUpload } = require("../uploadStorage");

    await expect(
      promoteUpload({ uploadId, expectedSizeBytes: 7, expectedContentType: "application/pdf" })
    ).rejects.toThrow(/size/i);
    expect(source.deleteIfExists).not.toHaveBeenCalled();
  });

  it("downloads only a verified stored ready path", async () => {
    const ready = blob({ downloadToBuffer: vi.fn().mockResolvedValue(Buffer.from("safe")) });
    azure.state.blobs.set(`ready/${canonicalUploadId}`, ready);
    const { downloadUploadBuffer } = require("../uploadStorage");
    const upload = { id: uploadId, status: "ready", blob_name: `ready/${canonicalUploadId}` };

    await expect(downloadUploadBuffer({ ...upload, path: "other/attacker-blob" })).resolves.toEqual(
      Buffer.from("safe")
    );
    await expect(downloadUploadBuffer({ ...upload, blob_name: "other/attacker-blob" })).rejects.toThrow(
      /ready blob/i
    );
    expect(azure.getBlob).toHaveBeenCalledWith(`ready/${canonicalUploadId}`);
  });

  it("issues a read-only grant only for a verified ready upload", () => {
    const { issueReadGrant } = require("../uploadStorage");
    const upload = {
      id: uploadId,
      status: "ready",
      blob_name: `ready/${canonicalUploadId}`,
      content_type: "application/pdf",
    };

    const grant = issueReadGrant(upload, "2026-08-25T03:00:00.000Z");

    expect(grant.blobName).toBe(`ready/${canonicalUploadId}`);
    expect(azure.generateBlobSASQueryParameters).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: "r", blobName: `ready/${canonicalUploadId}` }),
      expect.anything()
    );
    expect(() => issueReadGrant({ ...upload, blob_name: "staging/other" }, "2026-08-25T03:00:00.000Z")).toThrow(
      /ready blob/i
    );
  });

  it("treats an absent staging blob as successfully deleted", async () => {
    const staging = blob({ deleteIfExists: vi.fn().mockRejectedValue(missingBlob()) });
    azure.state.blobs.set(`staging/${canonicalUploadId}`, staging);
    const { deleteStagingBlob } = require("../uploadStorage");

    await expect(deleteStagingBlob(uploadId)).resolves.toEqual({ deleted: false });
  });
});
