import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_IMAGE_QUALITY,
  editGptImage,
  generateGptImage,
  normalizeImageQuality,
} from "../gptImage";

describe("normalizeImageQuality", () => {
  it("accepts the three Azure rendering efforts", () => {
    expect(normalizeImageQuality("low")).toBe("low");
    expect(normalizeImageQuality("MEDIUM")).toBe("medium");
    expect(normalizeImageQuality(" high ")).toBe("high");
  });

  it("falls back to the default for anything else", () => {
    expect(normalizeImageQuality("ultra")).toBe(DEFAULT_IMAGE_QUALITY);
    expect(normalizeImageQuality(undefined)).toBe(DEFAULT_IMAGE_QUALITY);
    expect(normalizeImageQuality(null)).toBe(DEFAULT_IMAGE_QUALITY);
  });
});

describe("gpt-image-2 requests carry the quality", () => {
  const originalEnv = { ...process.env };
  let fetchMock;

  beforeEach(() => {
    process.env.GPT_IMAGE_ENDPOINT =
      "https://example.openai.azure.com/openai/deployments/gpt-image-2/images/generations?api-version=2025-04-01-preview";
    process.env.GPT_IMAGE_API_KEY = "secret";
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [{ b64_json: "abc" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("sends the requested quality when generating", async () => {
    await generateGptImage({ prompt: "a cat", aspectRatio: "16:9", quality: "high" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.quality).toBe("high");
    expect(body.size).toBe("1536x1024");
  });

  it("normalizes an unsupported quality when generating", async () => {
    await generateGptImage({ prompt: "a cat", aspectRatio: "1:1", quality: "ultra" });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.quality).toBe(DEFAULT_IMAGE_QUALITY);
  });

  it("sends the requested quality when editing", async () => {
    await editGptImage({
      imageBase64: Buffer.from("png").toString("base64"),
      mimeType: "image/png",
      prompt: "make it blue",
      aspectRatio: "1:1",
      quality: "low",
    });

    const formData = fetchMock.mock.calls[0][1].body;
    expect(formData.get("quality")).toBe("low");
  });

  it("retries a transient backend failure when editing", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () =>
          JSON.stringify({ error: { message: "Backend call failure" } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ data: [{ b64_json: "abc" }] }),
      });

    const request = editGptImage({
      imageBase64: Buffer.from("png").toString("base64"),
      mimeType: "image/png",
      prompt: "make it blue",
      aspectRatio: "1:1",
      quality: "low",
    });

    await vi.advanceTimersByTimeAsync(2000);

    await expect(request).resolves.toEqual({
      imageUrl: "data:image/png;base64,abc",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
