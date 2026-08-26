import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const auth = require("../../_shared/auth");
const identity = require("../../_shared/identity");
const rateLimit = require("../../_shared/rateLimit");
const llmModels = require("../../_shared/llmModels");
const llmRuntime = require("../../_shared/llmRuntime");

auth.requireAuth = vi.fn();
identity.resolveIdentity = vi.fn();
rateLimit.rateLimit = vi.fn();
llmModels.resolveRoleModel = vi.fn();
llmRuntime.generateJson = vi.fn();

const handler = require("../index");

const invoke = async (body) => {
  const log = vi.fn();
  log.error = vi.fn();
  const context = { log };
  await handler(context, { method: "POST", headers: {}, body });
  return context.res;
};

describe("optimize-prompt template context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.requireAuth.mockResolvedValue({ user: { sub: "provider-user-1" } });
    identity.resolveIdentity.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
    });
    rateLimit.rateLimit.mockReturnValue({ limited: false });
    llmModels.resolveRoleModel.mockResolvedValue({ deployment: "prompt-model" });
    llmRuntime.generateJson.mockResolvedValue({
      optimizedPromptZh: "優化後描述",
      optimizedPromptEn: "An optimized prompt.",
      explanation: "加入了結構規則。",
    });
  });

  it("includes output structure rules in the optimizer request", async () => {
    const response = await invoke({
      userScript: "季度營收圖表",
      templateContext: {
        version: 1,
        id: "infographic",
        outputType: "infographic",
        moduleCount: 4,
        informationFlow: "橫向流程",
        guidance: ["保留清楚的閱讀順序。"],
        pitfalls: ["避免長段正文。"],
      },
    });

    expect(response.status).toBe(200);
    expect(llmRuntime.generateJson).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage: expect.stringContaining("exactly 4 visual modules"),
      })
    );
  });

  it("rejects invalid output structure rules before calling the model", async () => {
    const response = await invoke({
      userScript: "季度營收圖表",
      templateContext: {
        version: 1,
        id: "unknown",
        moduleCount: 4,
        informationFlow: "橫向流程",
        guidance: ["rule"],
        pitfalls: ["pitfall"],
      },
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("invalid_template_context");
    expect(llmRuntime.generateJson).not.toHaveBeenCalled();
  });
});
