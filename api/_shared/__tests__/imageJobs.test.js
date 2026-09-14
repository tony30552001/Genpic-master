import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const db = require("../db");
const blobStorage = require("../blobStorage");
const gptImage = require("../gptImage");
const imageUploads = require("../imageUploads");
const imageModels = require("../imageModels");
const modelPolicy = require("../modelPolicy");
const { ImageModelError } = require("../imageModelConfig");

db.query = vi.fn();
db.getPool = vi.fn();
blobStorage.uploadGeneratedImage = vi.fn();
gptImage.editGptImage = vi.fn();
gptImage.generateGptImage = vi.fn();
imageUploads.downloadOwnedImage = vi.fn();
imageUploads.resolveOwnedImageUpload = vi.fn();
imageModels.resolveImageModel = vi.fn();
imageModels.withImageModelTransaction = vi.fn();
modelPolicy.ensureModelPolicy = vi.fn();

const { createImageJob, getImageJobForUser, processNextImageJob } = require("../imageJobs");
const config = {
  modelKey: "gpt-image-2.5-flare", apiType: "azure-openai-images-v1",
  endpoint: "https://flare.openai.azure.com/openai/v1", deploymentName: "flare-alias",
  apiKey: "test-secret", supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"],
  defaultQuality: "medium",
};
const input = { tenantId: "tenant-1", userId: "user-1", prompt: "make it blue" };
const job = {
  id: "job-1", tenant_id: "tenant-1", user_id: "user-1", model: config.modelKey,
  operation: "generate", source_upload_id: null, prompt: "make it blue",
  aspect_ratio: "1:1", quality: "max", attempts: 1,
};
let client;
const claim = (record = job) => {
  client.query.mockReset().mockResolvedValue({ rows: [] })
    .mockResolvedValueOnce({}).mockResolvedValueOnce({})
    .mockResolvedValueOnce({ rows: record ? [record] : [] }).mockResolvedValueOnce({});
};

describe("durable catalog-backed image jobs", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    client = { query: vi.fn().mockResolvedValue({ rows: [{ id: "job-1", status: "queued", model: config.modelKey, operation: "generate" }] }), release: vi.fn() };
    db.getPool.mockReturnValue({ connect: vi.fn().mockResolvedValue(client) });
    db.query.mockResolvedValue({ rows: [], rowCount: 1 });
    imageModels.withImageModelTransaction.mockImplementation(async (_tenant, action) => action(client));
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: config.modelKey, allowedModels: [config.modelKey] });
    imageModels.resolveImageModel.mockResolvedValue(config);
    imageUploads.resolveOwnedImageUpload.mockResolvedValue({ id: "upload-1" });
    imageUploads.downloadOwnedImage.mockResolvedValue({ buffer: Buffer.from("source"), contentType: "image/png" });
    gptImage.generateGptImage.mockResolvedValue({ imageUrl: "data:image/png;base64,result" });
    gptImage.editGptImage.mockResolvedValue({ imageUrl: "data:image/png;base64,result" });
    blobStorage.uploadGeneratedImage.mockImplementation(async ({ blobName }) => ({ blobName, contentType: "image/png" }));
  });
  afterEach(() => vi.restoreAllMocks());

  it("selects policy and resolves configuration under the same admission transaction", async () => {
    await expect(createImageJob(input)).resolves.toMatchObject({ id: "job-1", model: config.modelKey });
    expect(imageModels.withImageModelTransaction).toHaveBeenCalledWith(input.tenantId, expect.any(Function));
    expect(modelPolicy.ensureModelPolicy).toHaveBeenCalledWith(input.tenantId, client);
    expect(imageModels.resolveImageModel).toHaveBeenCalledWith({ tenantId: input.tenantId, modelKey: config.modelKey, client });
    expect(client.query.mock.calls[0][0]).toContain("RETURNING id, status, model, operation");
    expect(client.query.mock.calls[0][1]).toEqual([
      input.tenantId, input.userId, config.modelKey, input.prompt, null, null, "medium", "generate", null,
    ]);
    expect(db.query).not.toHaveBeenCalled();
    expect(imageModels.resolveImageModel.mock.invocationCallOrder[0])
      .toBeLessThan(client.query.mock.invocationCallOrder[0]);
  });

  it.each(config.supportedQualities)("persists Flare %s exactly with an owned edit source", async (quality) => {
    await createImageJob({ ...input, quality, operation: "edit", sourceUploadId: "upload-1" });
    expect(client.query.mock.calls[0][1]).toEqual([
      input.tenantId, input.userId, config.modelKey, input.prompt, null, null, quality, "edit", "upload-1",
    ]);
  });

  it("permits a trusted admin test's explicit model without the user policy", async () => {
    await createImageJob({ ...input, model: "admin-test-model", quality: "low" });
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    expect(imageModels.resolveImageModel).toHaveBeenCalledWith({
      tenantId: input.tenantId, modelKey: "admin-test-model", client,
    });
  });

  it.each(["xhigh", "max", "auto", null, "", 0, false, {}, "HIGH"])(
    "rejects unsupported GPT2 quality %j without inserting a job", async (quality) => {
      imageModels.resolveImageModel.mockResolvedValue({ ...config, supportedQualities: ["low", "medium", "high"] });
      await expect(createImageJob({ ...input, quality })).rejects.toMatchObject({ status: 400, retryable: false });
      expect(client.query).not.toHaveBeenCalled();
    }
  );

  it.each([{ defaultModel: null, allowedModels: [] }, { defaultModel: "removed", allowedModels: [] }])(
    "rejects missing or disallowed policy before insertion", async (policy) => {
      modelPolicy.ensureModelPolicy.mockResolvedValue(policy);
      await expect(createImageJob(input)).rejects.toMatchObject({ status: 503, code: "image_model_not_configured" });
      expect(client.query).not.toHaveBeenCalled();
    }
  );

  it("does not enqueue when the runtime configuration is unavailable", async () => {
    imageModels.resolveImageModel.mockRejectedValue(new ImageModelError("Not configured", "image_model_not_configured", 503));
    await expect(createImageJob(input)).rejects.toMatchObject({ status: 503 });
    expect(client.query).not.toHaveBeenCalled();
  });

  it.each([
    { operation: "edit" }, { operation: "generate", sourceUploadId: "upload-1" }, { operation: "unknown" },
  ])("rejects invalid operation/source combinations %j", async (values) => {
    await expect(createImageJob({ ...input, ...values })).rejects.toMatchObject({ status: 400 });
    expect(imageModels.withImageModelTransaction).not.toHaveBeenCalled();
  });

  it.each(["generate", "edit"])("uses persisted tenant/model for %s despite a changed policy", async (operation) => {
    claim({ ...job, operation, source_upload_id: operation === "edit" ? "upload-1" : null });
    modelPolicy.ensureModelPolicy.mockResolvedValue({ defaultModel: "new-model", allowedModels: ["new-model"] });
    await expect(processNextImageJob()).resolves.toBe(true);
    expect(imageModels.resolveImageModel).toHaveBeenCalledWith({ tenantId: job.tenant_id, modelKey: job.model });
    expect(modelPolicy.ensureModelPolicy).not.toHaveBeenCalled();
    const provider = operation === "edit" ? gptImage.editGptImage : gptImage.generateGptImage;
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({
      config, prompt: job.prompt, aspectRatio: job.aspect_ratio, quality: "max",
    }));
    if (operation === "edit") {
      expect(imageUploads.resolveOwnedImageUpload).toHaveBeenCalledWith({
        uploadId: "upload-1", tenantId: job.tenant_id, userId: job.user_id,
      });
      expect(provider).toHaveBeenCalledWith(expect.objectContaining({
        imageBase64: Buffer.from("source").toString("base64"), mimeType: "image/png",
      }));
    }
    expect(client.query.mock.calls[2][0]).toContain("FOR UPDATE SKIP LOCKED");
    expect(client.query.mock.calls[2][0]).not.toContain("model =");
    expect(db.query.mock.calls.at(-1)).toEqual([
      expect.stringContaining("AND attempts = $4"),
      [job.id, `jobs/${job.id}/1.png`, "image/png", 1],
    ]);
  });

  it("claims an unknown model and fails it terminally, without skipping or a fallback", async () => {
    claim({ ...job, model: "unknown" });
    imageModels.resolveImageModel.mockRejectedValue(new ImageModelError("Not configured", "image_model_not_configured", 503));
    await processNextImageJob();
    expect(gptImage.generateGptImage).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0]).toEqual([
      expect.stringContaining("status = 'failed'"), [job.id, "image_model_not_configured", "Not configured", 1],
    ]);
  });

  it("fails an invalid persisted quality without provider work", async () => {
    claim({ ...job, quality: null });
    await processNextImageJob();
    expect(gptImage.generateGptImage).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][0]).toContain("status = 'failed'");
  });

  it("rechecks upload ownership at execution and fails missing sources without retry", async () => {
    claim({ ...job, operation: "edit", source_upload_id: "upload-1" });
    imageUploads.resolveOwnedImageUpload.mockResolvedValue(null);
    await processNextImageJob();
    expect(gptImage.editGptImage).not.toHaveBeenCalled();
    expect(imageUploads.downloadOwnedImage).not.toHaveBeenCalled();
    expect(db.query.mock.calls[0][1][1]).toBe("upload_not_found");
  });

  it.each([
    { retryable: true, attempts: 1, status: "queued" },
    { retryable: true, attempts: 3, status: "failed" },
    { retryable: false, attempts: 1, status: "failed" },
    { retryable: undefined, attempts: 1, status: "queued" },
  ])("bounds retries using transient classification: %j", async ({ retryable, attempts, status }) => {
    claim({ ...job, attempts });
    gptImage.generateGptImage.mockRejectedValue(Object.assign(new Error("secret provider body"), { retryable, status: 503 }));
    await processNextImageJob();
    expect(db.query.mock.calls[0][0]).toContain(`status = '${status}'`);
    expect(db.query.mock.calls[0][0]).toContain("AND attempts =");
    expect(db.query.mock.calls[0][1].at(-1)).toBe(attempts);
    expect(JSON.stringify(db.query.mock.calls)).not.toContain("secret provider body");
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("secret provider body");
  });

  it.each([
    { statusCode: 503 },
    { statusCode: 429 },
    { code: "ECONNRESET" },
    { cause: { code: "ECONNRESET" } },
  ])("retries recognized storage I/O failures %j", async (details) => {
    claim();
    blobStorage.uploadGeneratedImage.mockRejectedValue(Object.assign(new Error("private storage message"), details));
    await processNextImageJob();
    expect(db.query.mock.calls[0]).toEqual([
      expect.stringContaining("status = 'queued'"), [job.id, 5, 1],
    ]);
    expect(db.query.mock.calls[0][0]).toContain("AND attempts = $3");
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("private storage message");
  });

  it("retries a transient socket error when resolving the persisted model", async () => {
    claim();
    imageModels.resolveImageModel.mockRejectedValue(Object.assign(new Error("private DB message"), { code: "ECONNRESET" }));
    await processNextImageJob();
    expect(db.query.mock.calls[0][0]).toContain("status = 'queued'");
    expect(gptImage.generateGptImage).not.toHaveBeenCalled();
  });

  it.each([
    { statusCode: 400 },
    { statusCode: 400, cause: { code: "ECONNRESET" } },
    { statusCode: 503, retryable: false },
    { code: "unknown-sensitive-code" },
    {},
  ])("does not retry permanent or unclassified storage failures %j", async (details) => {
    claim();
    blobStorage.uploadGeneratedImage.mockRejectedValue(Object.assign(new Error("private storage message"), details));
    await processNextImageJob();
    expect(db.query.mock.calls[0][0]).toContain("status = 'failed'");
    expect(console.error).toHaveBeenCalledWith("[image-jobs] Job failed permanently:", expect.objectContaining({
      code: "generation_failed",
    }));
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("private storage message");
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("unknown-sensitive-code");
  });

  it("keeps malformed provider responses terminal despite their HTTP 502 status", async () => {
    claim();
    gptImage.generateGptImage.mockRejectedValue(Object.assign(new Error("Malformed response"), {
      code: "image_provider_response", status: 502, retryable: false,
    }));
    await processNextImageJob();
    expect(db.query.mock.calls[0][0]).toContain("status = 'failed'");
  });

  it("bounds transient storage retries and logs only a safe code and status", async () => {
    claim({ ...job, attempts: 3 });
    blobStorage.uploadGeneratedImage.mockRejectedValue(Object.assign(new Error("private storage message"), {
      statusCode: 503, code: "private storage code",
    }));
    await processNextImageJob();
    expect(db.query.mock.calls[0][0]).toContain("status = 'failed'");
    expect(db.query.mock.calls[0][1].at(-1)).toBe(3);
    expect(console.error).toHaveBeenCalledWith("[image-jobs] Job failed permanently:", {
      jobId: job.id, attempts: 3, code: "transient_io_exhausted", status: 503,
    });
  });

  it("fences a stale success and never writes the newer claim's blob path", async () => {
    claim({ ...job, attempts: 1 });
    db.query.mockResolvedValue({ rows: [], rowCount: 0 });
    await processNextImageJob();
    expect(blobStorage.uploadGeneratedImage).toHaveBeenCalledWith({
      blobName: `jobs/${job.id}/1.png`, source: "data:image/png;base64,result",
    });
    expect(db.query.mock.calls[0][0]).toContain("AND attempts = $4");
    expect(db.query.mock.calls[0][1][3]).toBe(1);
  });

  it("scopes status/history lookups to both owner identifiers", async () => {
    db.query.mockResolvedValue({ rows: [{ ...job, prompt: "internal" }] });
    await expect(getImageJobForUser({ jobId: job.id, tenantId: "tenant-1", userId: "user-1" }))
      .resolves.toMatchObject({ prompt: "internal" });
    expect(db.query.mock.calls[0]).toEqual([
      expect.stringContaining("WHERE id = $1 AND tenant_id = $2 AND user_id = $3"),
      [job.id, "tenant-1", "user-1"],
    ]);
  });

  it("returns no work when the queue is empty", async () => {
    claim(null);
    await expect(processNextImageJob()).resolves.toBe(false);
    expect(imageModels.resolveImageModel).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalled();
  });
});
