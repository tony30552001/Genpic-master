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
      blobUrl: "https://storage.example.test/uploads/upload-123",
      sasToken: "sig=secret",
      expiresAt: "2026-08-25T00:00:00.000Z",
    });

    await createUpload({
      fileName: "report.pdf",
      contentType: "application/pdf",
      sizeBytes: 42,
      purpose: "document",
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
      blobUrl: "https://storage.example.test/uploads/upload-123",
      sasToken: "?sig=secret",
      file,
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://storage.example.test/uploads/upload-123?sig=secret",
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

  it("orchestrates create, PUT, and completion without exposing grant data", async () => {
    apiPost
      .mockResolvedValueOnce({
        uploadId: "upload-123",
        status: "pending",
        blobUrl: "https://storage.example.test/uploads/upload-123",
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

  it("does not complete when the Blob PUT fails", async () => {
    apiPost.mockResolvedValueOnce({
      uploadId: "upload-123",
      status: "pending",
      blobUrl: "https://storage.example.test/uploads/upload-123",
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
        blobUrl: "https://storage.example.test/uploads/upload-123",
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
      blobUrl: "https://storage.example.test/uploads/upload-123",
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
      uploadId: "upload-123", status: "pending", blobUrl: "https://storage.example.test/uploads/upload-123", sasToken: "sig=secret", expiresAt: "2026-08-25T00:00:00.000Z",
    }).mockResolvedValueOnce({ uploadId: "upload-123", status: "ready" });
    fetch.mockResolvedValueOnce({ ok: true });

    await expect(requestBlobSas({ fileName: file.name })).rejects.toMatchObject({ code: "upload_api_replaced", message: "upload_api_replaced" });
    await expect(uploadFileToBlob(file, "caller-controlled-container")).resolves.toEqual({ uploadId: "upload-123", status: "ready" });
    expect(apiPost).not.toHaveBeenCalledWith(expect.stringContaining("blob-sas"), expect.anything());
    expect(apiPost).toHaveBeenCalledWith(`${API_BASE_URL}/uploads`, expect.not.objectContaining({ container: expect.anything() }));
  });
});
