import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const imageModels = require("../imageModels");
const imageProviders = require("../imageProviders");
const blobStorage = require("../blobStorage");
const pptMaster = require("../pptMasterClient");
const { ImageModelError } = require("../imageModelConfig");
imageModels.resolveImageModel = vi.fn();
imageProviders.renderImage = vi.fn();
blobStorage.uploadGeneratedBlob = vi.fn();
pptMaster.writeImage = vi.fn();

const {
  buildIllustrationPrompt,
  deckImageBlobName,
  generateDeckImages,
  mapWithConcurrency,
} = require("../deckImages");

const CONFIG = {
  modelKey: "gpt-image-2.5-flare",
  label: "Flare",
  apiType: "azure-openai-images-v1",
  endpoint: "https://flare.openai.azure.com/openai/v1",
  deploymentName: "flare-deployment",
  apiKey: "test-only-secret",
  supportedQualities: ["medium", "max", "auto"],
  defaultQuality: "auto",
};

const slide = (overrides = {}) => ({
  slide_number: 1,
  page_role: "cover",
  title: "封面",
  key_points: [],
  needs_image: true,
  image_role: "background",
  image_prompt: "a lighthouse at dawn",
  ...overrides,
});

describe("buildIllustrationPrompt", () => {
  it("carries the deck art direction so every picture shares one look", () => {
    const prompt = buildIllustrationPrompt({
      slide: slide(),
      artDirection: "muted editorial palette, soft grain",
    });

    expect(prompt).toContain("a lighthouse at dawn");
    expect(prompt).toContain("muted editorial palette, soft grain");
  });

  it("describes the layout role the picture has to play", () => {
    const artDirection = "muted editorial palette";

    expect(
      buildIllustrationPrompt({ slide: slide({ image_role: "background" }), artDirection })
    ).toContain("Full-bleed background");
    expect(
      buildIllustrationPrompt({ slide: slide({ image_role: "hero" }), artDirection })
    ).toContain("half of the slide");
    expect(
      buildIllustrationPrompt({ slide: slide({ image_role: "accent" }), artDirection })
    ).toContain("supporting accent");
  });

  it("falls back to the accent role and survives a missing art direction", () => {
    const prompt = buildIllustrationPrompt({ slide: slide({ image_role: "mural" }) });

    expect(prompt).toContain("supporting accent");
    expect(prompt).not.toContain("\n\n");
  });

  it("demands a crop-safe composition and no baked-in text", () => {
    const prompt = buildIllustrationPrompt({ slide: slide() });

    expect(prompt).toContain("safe margins");
    expect(prompt).toContain("Do not include text");
  });
});

describe("mapWithConcurrency", () => {
  it("never exceeds the requested fan-out and still visits every item", async () => {
    const seen = [];
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 2, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      seen.push(item);
      inFlight -= 1;
    });

    expect(peak).toBe(2);
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("does nothing when there is nothing to do", async () => {
    let calls = 0;
    await mapWithConcurrency([], 2, async () => {
      calls += 1;
    });

    expect(calls).toBe(0);
  });
});

describe("deckImageBlobName", () => {
  it("keeps deck illustrations under their job prefix", () => {
    expect(deckImageBlobName({ jobId: "job-1", name: "slide_01.png" })).toBe(
      "decks/job-1/images/slide_01.png"
    );
  });
});

describe("generateDeckImages", () => {
  const outlineOf = (slides) => ({ title: "AI 策略", art_direction: "", slides });

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    imageModels.resolveImageModel.mockResolvedValue(CONFIG);
    imageProviders.renderImage.mockResolvedValue({
      buffer: Buffer.from("image"), contentType: "image/png",
    });
    blobStorage.uploadGeneratedBlob.mockResolvedValue({});
    pptMaster.writeImage.mockResolvedValue({});
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports the user's choice instead of claiming the deck needs no images", async () => {
    const events = [];

    const images = await generateDeckImages({
      deckId: "deck",
      jobId: "job",
      outline: outlineOf([
        slide({ needs_image: false, image_prompt: "" }),
        slide({ slide_number: 2, needs_image: false, image_prompt: "" }),
      ]),
      tenantId: "tenant",
      modelKey: null,
      onProgress: async (event) => events.push(event),
    });

    expect(images).toEqual({});
    expect(imageModels.resolveImageModel).not.toHaveBeenCalled();
    expect(imageProviders.renderImage).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        step: "images",
        status: "skipped",
        detail: "依設定不產生配圖，全部頁面以純版面呈現",
      },
    ]);
  });

  describe("when the saved model has no configuration", () => {
    it("records a failed step and lets authoring continue without pictures", async () => {
      const events = [];
      imageModels.resolveImageModel.mockRejectedValue(
        new ImageModelError("not configured", "image_model_not_configured", 503)
      );

      const images = await generateDeckImages({
        deckId: "deck",
        jobId: "job",
        outline: outlineOf([slide(), slide({ slide_number: 2 })]),
        tenantId: "tenant",
        modelKey: "gpt-image-2",
        onProgress: async (event) => events.push(event),
      });

      expect(images).toEqual({});
      expect(imageModels.resolveImageModel).toHaveBeenCalledExactlyOnceWith({
        tenantId: "tenant", modelKey: "gpt-image-2",
      });
      expect(imageProviders.renderImage).not.toHaveBeenCalled();
      expect(events).toEqual([
        {
          step: "images",
          status: "failed",
          detail: "圖片生成模型 gpt-image-2 尚未設定，2 頁改以純版面呈現",
        },
      ]);
    });
  });

  it.each([
    ["crypto", new ImageModelError("test-only-secret", "secret_decryption_failed", 500)],
    ["database", new Error("test-only-secret")],
  ])("reports %s lookup failures distinctly without leaking config", async (_label, error) => {
    imageModels.resolveImageModel.mockRejectedValue(error);
    const events = [];
    const images = await generateDeckImages({
      deckId: "deck", jobId: "job", tenantId: "tenant", modelKey: CONFIG.modelKey,
      outline: outlineOf([slide()]), onProgress: async (event) => events.push(event),
    });
    expect(images).toEqual({});
    expect(events).toEqual([expect.objectContaining({
      step: "images", status: "failed", detail: expect.stringContaining("設定讀取失敗"),
    })]);
    expect(JSON.stringify([events, console.warn.mock.calls])).not.toContain("test-only-secret");
    expect(imageProviders.renderImage).not.toHaveBeenCalled();
  });

  it("resolves Flare once for the entire phase and passes that exact config to every image", async () => {
    const images = await generateDeckImages({
      deckId: "deck", jobId: "job", tenantId: "tenant", modelKey: CONFIG.modelKey,
      outline: outlineOf([slide(), slide({ slide_number: 2 }), slide({ slide_number: 3 })]),
    });
    expect(imageModels.resolveImageModel).toHaveBeenCalledExactlyOnceWith({
      tenantId: "tenant", modelKey: CONFIG.modelKey,
    });
    expect(imageProviders.renderImage).toHaveBeenCalledTimes(3);
    for (const [request] of imageProviders.renderImage.mock.calls) {
      expect(request.config).toBe(CONFIG);
      expect(request.aspectRatio).toBe("16:9");
    }
    expect(images).toEqual({
      1: ["slide_01.png"], 2: ["slide_02.png"], 3: ["slide_03.png"],
    });
    expect(pptMaster.writeImage).toHaveBeenCalledTimes(3);
    expect(blobStorage.uploadGeneratedBlob).toHaveBeenCalledTimes(3);
  });

  it("records rendering failure per slide without falling back to another model", async () => {
    imageProviders.renderImage.mockRejectedValueOnce(new Error("test-only-secret"));
    const events = [];
    const images = await generateDeckImages({
      deckId: "deck", jobId: "job", tenantId: "tenant", modelKey: CONFIG.modelKey,
      outline: outlineOf([slide(), slide({ slide_number: 2 })]),
      onProgress: async (event) => events.push(event),
    });
    expect(images).toEqual({ 2: ["slide_02.png"] });
    expect(events).toContainEqual(expect.objectContaining({
      step: "images", status: "failed", slideNumber: 1,
    }));
    expect(imageModels.resolveImageModel).toHaveBeenCalledTimes(1);
    expect(imageProviders.renderImage).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([events, console.warn.mock.calls])).not.toContain("test-only-secret");
  });
});
