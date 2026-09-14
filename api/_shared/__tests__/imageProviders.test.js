import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const gptImage = require("../gptImage");
const blobStorage = require("../blobStorage");
gptImage.generateGptImage = vi.fn();
blobStorage.fetchImageSource = vi.fn();
const { renderImage } = require("../imageProviders");

describe("renderImage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    gptImage.generateGptImage.mockResolvedValue({ imageUrl: "data:image/png;base64,aQ==" });
    blobStorage.fetchImageSource.mockResolvedValue({
      buffer: Buffer.from("image"),
      contentType: "image/png",
    });
  });

  it.each(["gpt-image-2", "gpt-image-2.5-flare", "custom-deployment"])(
    "passes %s runtime config without a model-name whitelist",
    async (modelKey) => {
      const config = {
        modelKey,
        apiType: "azure-openai-images-v1",
        endpoint: `https://${modelKey}.openai.azure.com/openai/v1`,
        deploymentName: `deployment-${modelKey}`,
        apiKey: "test-only-key",
        supportedQualities: ["medium", "max"],
        defaultQuality: "medium",
      };
      const image = await renderImage({
        config, prompt: "a lighthouse", aspectRatio: "16:9", quality: "max",
      });

      expect(gptImage.generateGptImage).toHaveBeenCalledExactlyOnceWith({
        config, prompt: "a lighthouse", aspectRatio: "16:9", quality: "max",
      });
      expect(blobStorage.fetchImageSource).toHaveBeenCalledExactlyOnceWith(
        "data:image/png;base64,aQ=="
      );
      expect(image).toEqual({ buffer: Buffer.from("image"), contentType: "image/png" });
    }
  );

  it("does not replace provider defaults or retry with a different config", async () => {
    const failure = new Error("provider unavailable");
    const config = { modelKey: "gpt-image-2.5-flare", defaultQuality: "auto" };
    gptImage.generateGptImage.mockRejectedValue(failure);

    await expect(renderImage({ config, prompt: "x" })).rejects.toBe(failure);
    expect(gptImage.generateGptImage).toHaveBeenCalledExactlyOnceWith({
      config, prompt: "x", aspectRatio: undefined, quality: undefined,
    });
    expect(blobStorage.fetchImageSource).not.toHaveBeenCalled();
  });

  it("propagates image download failures", async () => {
    blobStorage.fetchImageSource.mockRejectedValue(new Error("download failed"));
    await expect(renderImage({ config: {}, prompt: "x" })).rejects.toThrow("download failed");
    expect(gptImage.generateGptImage).toHaveBeenCalledTimes(1);
  });
});
