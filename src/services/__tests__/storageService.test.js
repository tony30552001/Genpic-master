import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../apiClient", () => ({
  apiGet: vi.fn(() => Promise.resolve([{ id: "1" }])),
  apiPost: vi.fn(() => Promise.resolve({ id: "1" })),
  apiPut: vi.fn(() => Promise.resolve({ id: "1" })),
  apiDelete: vi.fn(() => Promise.resolve(null)),
}));

import {
  listHistory,
  listStyles,
  addStyle,
  updateStyle,
  deleteStyle,
  publishStyle,
  unpublishStyle,
  copyStyle,
  markStyleUsed,
  addHistoryItem,
  deleteHistoryItem,
  createUpload,
  putUploadBytes,
  uploadFile,
  uploadFileToBlob,
  requestBlobSas,
} from "../storageService";
import { apiGet, apiPost, apiPut, apiDelete } from "../apiClient";
import { API_BASE_URL } from "../../config";

describe("storageService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("listHistory calls apiGet", async () => {
    const result = await listHistory();
    expect(apiGet).toHaveBeenCalled();
    expect(result).toEqual([{ id: "1" }]);
  });

  it("listStyles calls apiGet", async () => {
    const result = await listStyles();
    expect(apiGet).toHaveBeenCalledWith(`${API_BASE_URL}/styles`);
    expect(result).toEqual([{ id: "1" }]);
  });

  it("listStyles serializes query params", async () => {
    const result = await listStyles({
      scope: "shared",
      category: "poster",
      tags: ["科技", "簡報"],
      sort: "popular",
      q: "brand",
    });
    expect(apiGet).toHaveBeenCalledWith(
      `${API_BASE_URL}/styles?scope=shared&category=poster&tags=%E7%A7%91%E6%8A%80%2C%E7%B0%A1%E5%A0%B1&sort=popular&q=brand`
    );
    expect(result).toEqual([{ id: "1" }]);
  });

  it("addStyle posts data", async () => {
    await addStyle({ name: "style" });
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles`, { name: "style" });
  });

  it("updateStyle puts data", async () => {
    await updateStyle("style-id", { name: "style" });
    expect(apiPut).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id`, { name: "style" });
  });

  it("deleteStyle calls delete", async () => {
    await deleteStyle("style-id");
    expect(apiDelete).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id`);
  });

  it("style sharing helpers post to action routes", async () => {
    await publishStyle("style-id");
    await unpublishStyle("style-id");
    await copyStyle("style-id");
    await markStyleUsed("style-id");

    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/publish`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/unpublish`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/copy`);
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/styles/style-id/use`);
  });

  it("addHistoryItem posts data", async () => {
    await addHistoryItem({ imageUrl: "url" });
    expect(apiPost).toHaveBeenCalled();
  });

  it("deleteHistoryItem calls delete", async () => {
    await deleteHistoryItem("item-id");
    expect(apiDelete).toHaveBeenCalled();
  });

  it("creates an upload without client-controlled storage fields", async () => {
    apiPost.mockResolvedValueOnce({
      uploadId: "upload-123",
      status: "pending",
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
      sasToken: "sig=secret",
      expiresAt: "2026-08-25T00:00:00.000Z",
    });

    await createUpload({
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      purpose: "document",
      container: "caller-selected-container",
      blobName: "caller-selected-name",
      path: "caller-selected-path",
      tenantId: "tenant-123",
      userId: "user-123",
    });

    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/uploads`, {
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      purpose: "document",
    });
  });

  it("puts bytes at the granted URL when the SAS token starts with a question mark", async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await putUploadBytes({
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
      sasToken: "?sig=secret",
      file,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://account.blob.core.windows.net/uploads/upload-123?sig=secret",
      expect.objectContaining({
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "image/png",
        },
        body: file,
      })
    );
  });

  it("appends a SAS token to an existing Blob query without a second question mark", async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await putUploadBytes({
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123?version=1",
      sasToken: "sig=secret",
      file,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://account.blob.core.windows.net/uploads/upload-123?version=1&sig=secret",
      expect.anything()
    );
  });

  it("joins a question-mark SAS token onto an existing Blob query", async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await putUploadBytes({
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123?version=1",
      sasToken: "?sig=secret",
      file,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://account.blob.core.windows.net/uploads/upload-123?version=1&sig=secret",
      expect.anything()
    );
  });

  it("rejects malformed Blob URLs before fetching", async () => {
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await expect(
      putUploadBytes({ blobUrl: "not a URL", sasToken: "sig=secret", file })
    ).rejects.toThrow("Invalid upload grant");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    "http://account.blob.core.windows.net/uploads/upload-123",
    "javascript:alert(1)",
    "https://storage.example.test/uploads/upload-123",
    "https://evilblob.core.windows.net.evil.example/uploads/upload-123",
  ])("rejects untrusted Blob URL %s before sending a SAS token", async (blobUrl) => {
    const file = new File(["image"], "photo.png", { type: "image/png" });

    await expect(
      putUploadBytes({ blobUrl, sasToken: "sig=secret", file })
    ).rejects.toThrow("Invalid upload grant");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not expose a signed URL when Blob fetch rejects", async () => {
    const signedUrl = "https://account.blob.core.windows.net/uploads/upload-123?sig=secret";
    fetch.mockRejectedValueOnce(new Error(`network failure: ${signedUrl}`));
    const file = new File(["image"], "photo.png", { type: "image/png" });

    const error = await putUploadBytes({
        blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
        sasToken: "sig=secret",
        file,
      }).catch((error) => error);

    expect(error.message).toBe("Upload failed");
    expect(error.message).not.toContain(signedUrl);
  });

  it("orchestrates create, PUT, and completion without exposing grant data", async () => {
    apiPost
      .mockResolvedValueOnce({
        uploadId: "upload-123",
        status: "pending",
        blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
        sasToken: "sig=secret",
        expiresAt: "2026-08-25T00:00:00.000Z",
      })
      .mockResolvedValueOnce({ uploadId: "upload-123", status: "ready" });
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    const result = await uploadFile(file, "document");

    expect(result).toEqual({ uploadId: "upload-123", status: "ready" });
    expect(Object.keys(result)).toEqual(["uploadId", "status"]);
    expect(fetch.mock.invocationCallOrder[0]).toBeLessThan(apiPost.mock.invocationCallOrder[1]);
    expect(apiPost).toHaveBeenLastCalledWith(
      `${API_BASE_URL}/uploads/upload-123/complete`
    );
  });

  it("uses inferred document MIME type for both create and Blob PUT", async () => {
    apiPost
      .mockResolvedValueOnce({
        uploadId: "upload-123",
        status: "pending",
        blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
        sasToken: "sig=secret",
        expiresAt: "2026-08-25T00:00:00.000Z",
      })
      .mockResolvedValueOnce({ uploadId: "upload-123", status: "ready" });
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["pdf"], "report.pdf", { type: "" });

    await uploadFile(file, "document");

    expect(apiPost.mock.calls[0]).toEqual([`${API_BASE_URL}/uploads`, {
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 3,
      purpose: "document",
    }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://account.blob.core.windows.net/uploads/upload-123?sig=secret",
      expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/pdf" }),
      })
    );
  });

  it("does not complete when the Blob PUT fails", async () => {
    apiPost.mockResolvedValueOnce({
      uploadId: "upload-123",
      status: "pending",
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
      sasToken: "sig=secret",
      expiresAt: "2026-08-25T00:00:00.000Z",
    });
    fetch.mockResolvedValueOnce({ ok: false, status: 403, text: vi.fn().mockResolvedValue("sig=secret") });
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    await expect(uploadFile(file, "document")).rejects.toThrow("Upload failed: 403");
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("does not return an upload ID when completion fails", async () => {
    apiPost
      .mockResolvedValueOnce({
        uploadId: "upload-123",
        status: "pending",
        blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
        sasToken: "sig=secret",
        expiresAt: "2026-08-25T00:00:00.000Z",
      })
      .mockRejectedValueOnce(new Error("completion rejected"));
    fetch.mockResolvedValueOnce({ ok: true });
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    await expect(uploadFile(file, "document")).rejects.toThrow("completion rejected");
  });

  it("rejects malformed grants before attempting a Blob PUT", async () => {
    apiPost.mockResolvedValueOnce({
      uploadId: "upload-123",
      status: "pending",
      blobUrl: "https://account.blob.core.windows.net/uploads/upload-123",
      sasToken: "",
      expiresAt: "2026-08-25T00:00:00.000Z",
    });
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });

    await expect(uploadFile(file, "document")).rejects.toThrow("Invalid upload grant");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps deprecated helpers local and free of the obsolete SAS endpoint", async () => {
    const file = new File(["pdf"], "report.pdf", { type: "application/pdf" });
    apiPost.mockResolvedValueOnce({
      uploadId: "upload-123", status: "pending", blobUrl: "https://account.blob.core.windows.net/uploads/upload-123", sasToken: "sig=secret", expiresAt: "2026-08-25T00:00:00.000Z",
    }).mockResolvedValueOnce({ uploadId: "upload-123", status: "ready" });
    fetch.mockResolvedValueOnce({ ok: true });

    await expect(requestBlobSas({ fileName: file.name })).rejects.toMatchObject({ code: "upload_api_replaced", message: "upload_api_replaced" });
    await expect(uploadFileToBlob(file, "caller-controlled-container")).resolves.toEqual({ uploadId: "upload-123", status: "ready" });
    expect(apiPost).not.toHaveBeenCalledWith(expect.stringContaining("blob-sas"), expect.anything());
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/uploads`, expect.not.objectContaining({ container: expect.anything() }));
  });
});
