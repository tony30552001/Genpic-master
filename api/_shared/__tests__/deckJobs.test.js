import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const uploads = require("../uploads");
const uploadStorage = require("../uploadStorage");
const documentParser = require("../documentParser");
const imageModels = require("../imageModels");
const modelPolicy = require("../modelPolicy");
const deckImages = require("../deckImages");
const deckAuthor = require("../deckAuthor");
const llmModels = require("../llmModels");
const pptMaster = require("../pptMasterClient");
const blobStorage = require("../blobStorage");
const { DEFAULT_DESIGN_SYSTEM } = require("../deckDesign");

db.query = vi.fn();
db.getPool = vi.fn();
uploads.getOwnedUpload = vi.fn();
uploadStorage.downloadUploadBuffer = vi.fn();
documentParser.parseDocumentBuffer = vi.fn();
imageModels.withImageModelTransaction = vi.fn();
imageModels.resolveImageModel = vi.fn();
modelPolicy.ensureModelPolicy = vi.fn();
deckImages.generateDeckImages = vi.fn();
deckAuthor.generateOutline = vi.fn();
deckAuthor.generateDesignSystem = vi.fn();
deckAuthor.authorDeck = vi.fn();
llmModels.resolveRoleModel = vi.fn();
pptMaster.getFonts = vi.fn();
pptMaster.createDeck = vi.fn();
pptMaster.exportDeck = vi.fn();
pptMaster.deleteDeck = vi.fn();
blobStorage.uploadGeneratedBlob = vi.fn();

const {
  createDeckJob,
  extractSourceMarkdown,
  getDeckJobForUser,
  processNextDeckJob,
  resolveDeckSourceUpload,
} = require("../deckJobs");

const OWNER = { tenantId: "tenant-1", userId: "user-1" };
const UPLOAD_ID = "123e4567-e89b-42d3-a456-426614174000";
const admissionClient = { query: vi.fn() };

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
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", vi.fn());
    admissionClient.query.mockResolvedValue({
      rows: [{ id: "deck-job-1", status: "queued", created_at: "2026-08-24T00:00:00.000Z" }],
    });
    imageModels.withImageModelTransaction.mockImplementation(
      async (_tenantId, action) => action(admissionClient)
    );
    modelPolicy.ensureModelPolicy.mockResolvedValue({
      allowedModels: ["gpt-image-2.5-flare"], defaultModel: "gpt-image-2.5-flare",
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

    const [sql, params] = admissionClient.query.mock.calls[0];
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
      "gpt-image-2.5-flare",
    ]);
    expect(sql).toContain("image_model_key");
    expect(sql).toContain("$17, $8");
    expect(imageModels.withImageModelTransaction).toHaveBeenCalledWith(
      OWNER.tenantId, expect.any(Function)
    );
    expect(modelPolicy.ensureModelPolicy).toHaveBeenCalledExactlyOnceWith(
      OWNER.tenantId, admissionClient
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(imageModels.resolveImageModel).not.toHaveBeenCalled();
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

    const [, params] = admissionClient.query.mock.calls[0];
    expect(params[12]).toBe("general");
  });

  it("admits an image-free deck without consulting image policy or credentials", async () => {
    modelPolicy.ensureModelPolicy.mockRejectedValueOnce(new Error("no configuration"));
    await createDeckJob({
      ...OWNER, inputKind: "topic", topic: "AI strategy", slideCount: 8, imageDensity: "none",
    });
    expect(admissionClient.query.mock.calls[0][1][16]).toBeNull();
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    expect(imageModels.resolveImageModel).not.toHaveBeenCalled();
  });

  it("pins an unconfigured admission to null even if policy is configured later", async () => {
    modelPolicy.ensureModelPolicy.mockResolvedValueOnce({
      allowedModels: [], defaultModel: null,
    });
    await createDeckJob({
      ...OWNER, inputKind: "topic", topic: "AI strategy", slideCount: 8, imageDensity: "key",
    });
    expect(admissionClient.query.mock.calls[0][1][16]).toBeNull();
    expect(imageModels.resolveImageModel).not.toHaveBeenCalled();
  });

  it("surfaces policy database failure instead of accepting a silently unconfigured job", async () => {
    modelPolicy.ensureModelPolicy.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(createDeckJob({
      ...OWNER, inputKind: "topic", topic: "AI strategy", slideCount: 8,
    })).rejects.toThrow("database unavailable");
    expect(admissionClient.query).not.toHaveBeenCalled();
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

describe("deck job pinned image model", () => {
  const job = {
    id: "deck-job-1", tenant_id: OWNER.tenantId, user_id: OWNER.userId,
    input_kind: "topic", topic: "AI strategy", slide_count: 4, image_density: "key",
    image_model_key: "gpt-image-2.5-flare", attempts: 1,
  };
  let workerClient;

  beforeEach(() => {
    vi.resetAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    workerClient = {
      query: vi.fn().mockImplementation(async (sql) => ({
        rows: sql.includes("WITH candidate AS") ? [job] : [],
      })),
      release: vi.fn(),
    };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(workerClient) });
    modelPolicy.ensureModelPolicy.mockResolvedValue({
      allowedModels: ["different-model"], defaultModel: "different-model",
    });
    llmModels.resolveRoleModel.mockResolvedValue({});
    pptMaster.getFonts.mockResolvedValue({ families: [] });
    deckAuthor.generateOutline.mockResolvedValue({
      outline: {
        title: "AI strategy",
        slides: [{ slide_number: 1, needs_image: true, image_prompt: "lighthouse" }],
      },
      synthesizedPrompts: [],
    });
    deckAuthor.generateDesignSystem.mockResolvedValue({
      ...DEFAULT_DESIGN_SYSTEM, artDirection: "editorial",
    });
    pptMaster.createDeck.mockResolvedValue({ deckId: "workspace" });
    deckImages.generateDeckImages.mockResolvedValue({ 1: ["slide_01.png"] });
    deckAuthor.authorDeck.mockResolvedValue({});
    pptMaster.exportDeck.mockResolvedValue(Buffer.from("pptx"));
    pptMaster.deleteDeck.mockResolvedValue({});
    blobStorage.uploadGeneratedBlob.mockResolvedValue({});
  });

  it("claims and propagates the saved model even after tenant policy changes", async () => {
    expect(await processNextDeckJob()).toBe(true);
    const claimSql = workerClient.query.mock.calls.find(([sql]) => sql.includes("WITH candidate AS"))[0];
    expect(claimSql).toContain("jobs.image_model_key");
    expect(claimSql).toContain("FOR UPDATE SKIP LOCKED");
    expect(claimSql).not.toContain("gpt-image-2");
    expect(deckImages.generateDeckImages).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        tenantId: OWNER.tenantId, modelKey: job.image_model_key,
        deckId: "workspace", artDirection: "editorial",
      })
    );
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    expect(deckAuthor.authorDeck).toHaveBeenCalledWith(
      expect.objectContaining({ imagesBySlide: { 1: ["slide_01.png"] } })
    );
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'succeeded'"))).toBe(true);
  });

  it("keeps the same model on a worker retry rather than reading the new default", async () => {
    deckAuthor.authorDeck.mockRejectedValueOnce(new Error("temporary authoring failure"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await processNextDeckJob();
      expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'queued'"))).toBe(true);
      workerClient.query.mockImplementation(async (sql) => ({
        rows: sql.includes("WITH candidate AS") ? [{ ...job, attempts: 2 }] : [],
      }));
      await processNextDeckJob();
      expect(deckImages.generateDeckImages).toHaveBeenCalledTimes(2);
      expect(deckImages.generateDeckImages.mock.calls.map(([args]) => args.modelKey))
        .toEqual([job.image_model_key, job.image_model_key]);
      expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
      expect(deckAuthor.authorDeck).toHaveBeenCalledTimes(2);
      expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'succeeded'"))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  it("passes a null admission key unchanged when a late outline asks for pictures", async () => {
    workerClient.query.mockImplementation(async (sql) => ({
      rows: sql.includes("WITH candidate AS") ? [{ ...job, image_model_key: null }] : [],
    }));
    deckImages.generateDeckImages.mockImplementation(async ({ onProgress }) => {
      await onProgress({ step: "images", status: "failed", detail: "image model not configured" });
      return {};
    });
    await processNextDeckJob();
    expect(deckImages.generateDeckImages).toHaveBeenCalledWith(
      expect.objectContaining({ modelKey: null })
    );
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    expect(deckAuthor.authorDeck).toHaveBeenCalledWith(expect.objectContaining({ imagesBySlide: {} }));
    expect(db.query.mock.calls).toContainEqual([
      expect.stringContaining("INSERT INTO deck_job_events"),
      [job.id, "images", "failed", null, "image model not configured"],
    ]);
    expect(db.query.mock.calls.some(([sql]) => sql.includes("SET status = 'succeeded'"))).toBe(true);
  });

  it("includes the pinned model in owner-scoped status reads", async () => {
    db.query.mockResolvedValueOnce({ rows: [job] });
    expect(await getDeckJobForUser({ jobId: job.id, ...OWNER })).toBe(job);
    expect(db.query).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("image_model_key"), [job.id, OWNER.tenantId, OWNER.userId]
    );
  });
});
