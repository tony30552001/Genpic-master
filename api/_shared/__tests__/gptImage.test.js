import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editGptImage, generateGptImage } from "../gptImage";

const gpt2 = {
  modelKey: "gpt-image-2",
  label: "GPT Image 2",
  apiType: "azure-openai-images-v1",
  endpoint: "https://gpt2.openai.azure.com/openai/v1",
  deploymentName: "gpt2-deployment",
  apiKey: "gpt2-test-key",
  supportedQualities: ["low", "medium", "high"],
  defaultQuality: "medium",
};
const flare = {
  ...gpt2,
  modelKey: "gpt-image-2.5-flare",
  endpoint: "https://flare.services.ai.azure.com/openai/v1",
  deploymentName: "flare-deployment",
  apiKey: "flare-test-key",
  supportedQualities: ["low", "medium", "high", "xhigh", "max", "auto"],
};
const image = { imageBase64: Buffer.from("png").toString("base64"), mimeType: "image/png" };
const response = (status = 200, data = { data: [{ b64_json: "abc" }] }) => ({
  ok: status === 200,
  status,
  body: { cancel: vi.fn().mockResolvedValue(undefined) },
  text: async () => JSON.stringify(data),
});

describe("catalog-backed Azure Images v1 adapter", () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(flare.supportedQualities)("preserves Flare %s for generation and editing", async (quality) => {
    await generateGptImage({ config: flare, prompt: "cat", aspectRatio: "16:9", quality });
    await editGptImage({ config: flare, ...image, prompt: "blue", quality });
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(`${flare.endpoint}/images/generations`);
    expect(JSON.parse(request.body)).toMatchObject({
      model: flare.deploymentName, quality, size: "1536x864", n: 1, output_format: "png",
    });
    const [editUrl, editRequest] = fetchMock.mock.calls[1];
    expect(editUrl).toBe(`${flare.endpoint}/images/edits`);
    expect(editRequest.body.get("quality")).toBe(quality);
    expect(editRequest.body.getAll("image")).toHaveLength(1);
    expect(editRequest.body.has("image[]")).toBe(false);
    expect(editRequest.body.get("model")).toBe(flare.deploymentName);
    expect(editRequest.body.get("n")).toBe("1");
    expect(editRequest.body.get("output_format")).toBe("png");
  });

  it.each(gpt2.supportedQualities)("preserves GPT Image 2 %s", async (quality) => {
    await generateGptImage({ config: gpt2, prompt: "cat", quality });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).quality).toBe(quality);
  });

  it.each(["xhigh", "max", "auto", null, "", 0, false, {}, " HIGH ", "ultra"])(
    "rejects explicit unsupported GPT2 quality %j before fetch", async (quality) => {
      await expect(generateGptImage({ config: gpt2, prompt: "cat", quality }))
        .rejects.toMatchObject({ status: 400, code: "bad_request", retryable: false });
      await expect(editGptImage({ config: gpt2, ...image, quality }))
        .rejects.toMatchObject({ status: 400 });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("uses only the selected model default when quality is omitted", async () => {
    await generateGptImage({ config: { ...flare, defaultQuality: "auto" }, prompt: "cat" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).quality).toBe("auto");
  });

  it("isolates endpoint, deployment and api-key across simultaneous models", async () => {
    await Promise.all([
      generateGptImage({ config: gpt2, prompt: "cat" }),
      generateGptImage({ config: flare, prompt: "dog" }),
      editGptImage({ config: gpt2, ...image }),
      editGptImage({ config: flare, ...image }),
    ]);
    for (const [index, config] of [gpt2, flare, gpt2, flare].entries()) {
      const [url, request] = fetchMock.mock.calls[index];
      expect(url).toBe(`${config.endpoint}/images/${index < 2 ? "generations" : "edits"}`);
      expect(request.headers["api-key"]).toBe(config.apiKey);
      expect(request.headers.Authorization).toBeUndefined();
      expect(request.redirect).toBe("error");
      expect(request.signal).toBeDefined();
      expect(index < 2 ? JSON.parse(request.body).model : request.body.get("model"))
        .toBe(config.deploymentName);
    }
  });

  it.each([undefined, { ...gpt2, apiKey: "" }, { ...gpt2, apiType: "other" }])(
    "rejects missing runtime configuration", async (config) => {
      await expect(generateGptImage({ config, prompt: "cat" }))
        .rejects.toMatchObject({ code: "image_model_not_configured", status: 503, retryable: false });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("rejects non-Azure and legacy endpoints without sending a key", async () => {
    for (const endpoint of [
      "https://example.com/openai/v1",
      `${gpt2.endpoint}/images/generations`,
      "https://gpt2.openai.azure.com/openai/deployments/old/images/generations",
    ]) {
      await expect(generateGptImage({ config: { ...gpt2, endpoint }, prompt: "cat" })).rejects.toThrow();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([408, 429, 500, 503])("retries transient HTTP %s with a fresh multipart body", async (status) => {
    vi.useFakeTimers();
    const failedResponse = response(status);
    fetchMock.mockResolvedValueOnce(failedResponse);
    const request = editGptImage({ config: flare, ...image });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(request).resolves.toEqual({ imageUrl: "data:image/png;base64,abc" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(failedResponse.body.cancel).toHaveBeenCalledOnce();
    expect(failedResponse.body.cancel.mock.invocationCallOrder[0])
      .toBeLessThan(fetchMock.mock.invocationCallOrder[1]);
    expect(fetchMock.mock.calls[0][1].body).not.toBe(fetchMock.mock.calls[1][1].body);
  });

  it.each([301, 400, 401, 403, 404, 422])("does not retry permanent HTTP %s or expose response text", async (status) => {
    const failedResponse = response(status, { error: { message: `leaked ${flare.apiKey}` } });
    fetchMock.mockResolvedValue(failedResponse);
    await expect(generateGptImage({ config: flare, prompt: "cat" })).rejects.toMatchObject({
      message: `圖片服務請求失敗 (${status})`, status, retryable: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(failedResponse.body.cancel).toHaveBeenCalledOnce();
  });

  it("awaits failed response body cancellation before beginning a retry", async () => {
    vi.useFakeTimers();
    let finishCancellation;
    const failedResponse = response(503);
    failedResponse.body.cancel.mockImplementation(() => new Promise((resolve) => {
      finishCancellation = resolve;
    }));
    fetchMock.mockResolvedValueOnce(failedResponse);
    const request = generateGptImage({ config: flare, prompt: "cat" });
    await vi.advanceTimersByTimeAsync(6000);
    expect(failedResponse.body.cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finishCancellation();
    await vi.advanceTimersByTimeAsync(2000);
    await expect(request).resolves.toEqual({ imageUrl: "data:image/png;base64,abc" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bounds exhausted retries and sanitizes their error", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(response(503, { message: flare.apiKey }));
    const result = generateGptImage({ config: flare, prompt: "cat" }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(6000);
    expect(await result).toMatchObject({ status: 503, retryable: true });
    expect((await result).message).not.toContain(flare.apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds all retry attempts and body streaming to one 12-minute deadline", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response(503));
    fetchMock.mockImplementationOnce(async (_url, { signal }) => ({
      ok: true, status: 200,
      text: () => new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error(flare.apiKey)), { once: true })),
    }));
    const result = generateGptImage({ config: flare, prompt: "cat" }).catch((error) => error);
    await vi.advanceTimersByTimeAsync(12 * 60 * 1000);
    expect(await result).toMatchObject({ code: "image_provider_timeout", status: 504, retryable: true });
    expect((await result).message).not.toContain(flare.apiKey);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not echo fetch errors, or retry redirect/config failures", async () => {
    fetchMock.mockRejectedValue(new TypeError(`redirect ${flare.apiKey} ${flare.endpoint}`));
    await expect(generateGptImage({ config: flare, prompt: "cat" }))
      .rejects.toMatchObject({ message: "圖片服務連線失敗", retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries known transient connection errors without exposing them", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError(flare.apiKey, { cause: { code: "ECONNRESET" } }));
    const result = generateGptImage({ config: flare, prompt: "cat" });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(result).resolves.toEqual({ imageUrl: "data:image/png;base64,abc" });
  });

  it.each([{}, { data: [{ url: "https://unexpected.example/image.png" }] }])(
    "rejects missing PNG data without a fallback renderer", async (data) => {
      fetchMock.mockResolvedValue(response(200, data));
      await expect(generateGptImage({ config: flare, prompt: "cat" }))
        .rejects.toMatchObject({ code: "image_provider_response", retryable: false });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );
});
