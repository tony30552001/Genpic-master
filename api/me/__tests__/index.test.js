import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const limiter = require("../../_shared/rateLimit");
const policy = require("../../_shared/modelPolicy");
const models = require("../../_shared/imageModels");
auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
limiter.rateLimit = vi.fn();
policy.ensureModelPolicy = vi.fn();
models.listPublicImageModels = vi.fn();
const handler = require("../index");

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireAuth.mockResolvedValue({ user: { sub: "admin" } });
  identity.resolveIdentity.mockResolvedValue({ tenantId: "tenant-1", userId: "admin", role: "admin" });
  limiter.rateLimit.mockReturnValue({ limited: false });
});

describe("profile image catalog", () => {
  it("keeps an unconfigured administrator able to open setup", async () => {
    policy.ensureModelPolicy.mockResolvedValue({ allowedModels: [], defaultModel: null });
    models.listPublicImageModels.mockResolvedValue([]);
    const context = {};
    await handler(context, { method: "GET", headers: {} });
    expect(context.res.status).toBe(200);
    expect(context.res.body).toMatchObject({
      user: { role: "admin" }, modelPolicy: { defaultModel: null }, imageModels: [],
    });
    expect(models.listPublicImageModels).toHaveBeenCalledWith("tenant-1");
  });

  it("returns dynamic public capabilities without changing existing policy", async () => {
    const modelPolicy = { allowedModels: ["gpt-image-2"], defaultModel: "gpt-image-2" };
    policy.ensureModelPolicy.mockResolvedValue(modelPolicy);
    const imageModels = [{ modelKey: "gpt-image-2.5-flare", supportedQualities: ["low", "max", "auto"] }];
    models.listPublicImageModels.mockResolvedValue(imageModels);
    const context = {};
    await handler(context, { method: "GET", headers: {} });
    expect(context.res.body.modelPolicy).toEqual(modelPolicy);
    expect(context.res.body.imageModels).toEqual(imageModels);
  });
});
