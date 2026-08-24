import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const azure = vi.hoisted(() => ({
  BlobSASPermissions: { parse: vi.fn() },
  StorageSharedKeyCredential: vi.fn(),
  generateBlobSASQueryParameters: vi.fn(),
}));

vi.mock("@azure/storage-blob", () => azure);

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const rateLimit = require("../../_shared/rateLimit");
auth.requireAuth = vi.fn();
rateLimit.rateLimit = vi.fn();

const handler = require("../index");

const invoke = async (body = {}) => {
  const context = {};
  await handler(context, { method: "POST", headers: {}, body });
  return context.res;
};

describe("retired blob-sas endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    rateLimit.rateLimit.mockReturnValue({ limited: false });
  });

  it("still requires authentication before returning the migration response", async () => {
    auth.requireAuth.mockResolvedValue(null);

    await expect(invoke({ fileName: "../../secret", container: "attacker" })).resolves.toBeUndefined();
    expect(rateLimit.rateLimit).not.toHaveBeenCalled();
  });

  it("returns an authenticated 410 without initializing Azure or echoing caller paths", async () => {
    const response = await invoke({
      fileName: "../../secret",
      container: "attacker-controlled-container",
      blobName: "attacker/blob",
    });

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      error: {
        code: "upload_api_replaced",
        message: "舊版 Blob SAS API 已停用，請改用 /api/uploads",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("attacker");
    expect(azure.StorageSharedKeyCredential).not.toHaveBeenCalled();
    expect(azure.generateBlobSASQueryParameters).not.toHaveBeenCalled();
  });

  it("marks the route deprecated and points clients to the uploads API", () => {
    const document = require("../../openapi");
    const operation = document.paths["/api/blob-sas"].post;

    expect(operation.deprecated).toBe(true);
    expect(operation.description).toContain("/api/uploads");
  });
});
