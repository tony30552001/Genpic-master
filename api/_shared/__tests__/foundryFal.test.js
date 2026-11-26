import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  downloadVideoResult,
  submitVideo,
} = require("../foundryFal");

const config = {
  endpoint: "https://resource.services.ai.azure.com/providers/falai/v1",
  apiKey: "secret",
};

afterEach(() => vi.unstubAllGlobals());

describe("Foundry fal client", () => {
  it("always uses the api-key header and returns the provider request id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ request_id: "request-123" }),
      { status: 200, headers: { "content-type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);
    await expect(submitVideo({
      config,
      path: "minimax/h3-max/text-to-video",
      body: { model: "deployment" },
    })).resolves.toBe("request-123");
    expect(fetchMock.mock.calls[0][0]).toContain("/providers/falai/v1/minimax/h3-max/text-to-video");
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({ "api-key": "secret" });
  });

  it("sanitizes provider validation errors and marks rate limits retryable", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: "sensitive provider body", error_type: "schema_validation_error" }),
        { status: 400 }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: "busy", error_type: "rate_limit_exceeded" }),
        { status: 429, headers: { "retry-after-ms": "17000" } }
      )));
    await expect(submitVideo({ config, path: "route", body: {} }))
      .rejects.toMatchObject({ code: "video_validation_failed", retryable: false });
    await expect(submitVideo({ config, path: "route", body: {} }))
      .rejects.toMatchObject({ code: "provider_rate_limited", retryable: true, retryAfterMs: 17000 });
  });

  it("classifies fal model errors from detail types", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: [{ loc: ["body"], msg: "flagged", type: "content_policy_violation" }] }),
        { status: 422 }
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ detail: [{ loc: ["body", "image_url"], msg: "too small", type: "image_too_small" }] }),
        { status: 422 }
      )));
    await expect(submitVideo({ config, path: "route", body: {} })).rejects.toMatchObject({
      code: "content_policy_blocked",
      retryable: false,
      providerStatus: 422,
      providerErrorType: "content_policy_violation",
    });
    await expect(submitVideo({ config, path: "route", body: {} })).rejects.toMatchObject({
      code: "video_validation_failed",
      providerErrorType: "image_too_small",
    });
  });

  it("never sends the API key to an off-origin asset URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(downloadVideoResult({
      config,
      result: { url: "https://evil.example/providers/falai/v1/assets/id/file" },
    })).rejects.toMatchObject({ code: "video_provider_invalid_response" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
