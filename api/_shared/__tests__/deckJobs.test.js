import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const uploads = require("../uploads");
const uploadStorage = require("../uploadStorage");
const documentParser = require("../documentParser");

db.query = vi.fn();
uploads.getOwnedUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();
documentParser.parseDocumentBuffer = vi.fn();

const {
  createDeckJob,
  extractSourceMarkdown,
  resolveDeckSourceUpload,
} = require("../deckJobs");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";

const readyUpload = (overrides = {}) => ({
  id: UPLOAD_ID,
  tenant_id: OWNER.tenantId,
  user_id: OWNER.userId,
  purpose: "document",
  original_file_name: "stored-brief.pdf",
  content_type: "application/pdf",
  blob_name: `ready/${UPLOAD_ID}`,
  status: "ready",
  expires_at: "2099-08-26T00:00:00.000Z",
  ...overrides,
});

describe("deck job source uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn());
    db.query.mockResolvedValue({
      rows: [{ id: "deck-job-1", status: "queued", created_at: "2026-08-24T00:00:00.000Z" }],
    });
    uploads.getOwnedUpload.mockResolvedValue(readyUpload());
    uploadStorage.downloadUploadBuffer.mockResolvedValue(Buffer.from("trusted"));
    documentParser.parseDocumentBuffer.mockResolvedValue({
      kind: "text",
      text: "trusted markdown",
      format: "pdf",
      parser: "anydoc",
      mimeType: "application/pdf",
    });
  });

  it("persists source_upload_id and leaves the legacy URL column null for new jobs", async () => {
    await createDeckJob({
      ...OWNER,
      inputKind: "document",
      topic: null,
      sourceUploadId: UPLOAD_ID,
      sourceDocumentUrl: null,
      sourceFileName: "stored-brief.pdf",
      slideCount: 8,
      imageDensity: "every",
      styleId: null,
      layoutId: null,
      brandId: null,
      recipeId: "pitch-deck",
      briefPurpose: "說服投資人",
      briefAudience: null,
      briefOutcome: null,
    });

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("source_upload_id");
    expect(sql).toContain("source_document_url");
    expect(params).toEqual([
      OWNER.tenantId,
      OWNER.userId,
      "document",
      null,
      UPLOAD_ID,
      null,
      "stored-brief.pdf",
      8,
      null,
      null,
      null,
      "every",
      "pitch-deck",
      "說服投資人",
      null,
      null,
    ]);
  });

  /** An unknown recipe must never reach the column; the id set grows in code. */
  it("collapses an unknown recipe to general before it is stored", async () => {
    await createDeckJob({
      ...OWNER,
      inputKind: "topic",
      topic: "AI 策略",
      sourceUploadId: null,
      sourceDocumentUrl: null,
      sourceFileName: null,
      slideCount: 8,
      imageDensity: "key",
      styleId: null,
      layoutId: null,
      brandId: null,
      recipeId: "made-up-recipe",
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[12]).toBe("general");
  });

  it("re-resolves a ready document upload by the job owner before reading bytes", async () => {
    const upload = await resolveDeckSourceUpload({
      sourceUploadId: UPLOAD_ID,
      ...OWNER,
    });

    expect(upload).toEqual(readyUpload());
    expect(uploads.getOwnedUpload).toHaveBeenCalledWith({
      uploadId: UPLOAD_ID,
      tenantId: OWNER.tenantId,
      userId: OWNER.userId,
      purpose: "document",
      status: "ready",
    });
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["expired", readyUpload({ expires_at: "2020-01-01T00:00:00.000Z" })],
    ["wrong owner", readyUpload({ user_id: "other-user" })],
  ])("rejects %s upload before any Blob read", async (_label, upload) => {
    uploads.getOwnedUpload.mockResolvedValue(upload);

    await expect(
      resolveDeckSourceUpload({ sourceUploadId: UPLOAD_ID, ...OWNER })
    ).rejects.toThrow("Source upload unavailable");
    expect(uploadStorage.downloadUploadBuffer).not.toHaveBeenCalled();
  });

  it("downloads and parses the stored ready blob metadata, not caller-selected values", async () => {
    const upload = readyUpload();

    const markdown = await extractSourceMarkdown({ sourceUpload: upload });

    expect(uploadStorage.downloadUploadBuffer).toHaveBeenCalledWith(upload);
    expect(fetch).not.toHaveBeenCalled();
    expect(documentParser.parseDocumentBuffer).toHaveBeenCalledWith({
      buffer: Buffer.from("trusted"),
      fileName: "stored-brief.pdf",
      mimeType: "application/pdf",
    });
    expect(markdown).toBe("trusted markdown");
  });
});
