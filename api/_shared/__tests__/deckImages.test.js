import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildIllustrationPrompt,
  deckImageBlobName,
  generateDeckImages,
  mapWithConcurrency,
} from "../deckImages";

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
    ).toContain("full-bleed background");
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
    expect(prompt).toContain("No text");
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

  it("reports the user's choice instead of claiming the deck needs no images", async () => {
    const events = [];

    const images = await generateDeckImages({
      deckId: "deck",
      jobId: "job",
      outline: outlineOf([
        slide({ needs_image: false, image_prompt: "" }),
        slide({ slide_number: 2, needs_image: false, image_prompt: "" }),
      ]),
      model: "gpt-image-2",
      onProgress: async (event) => events.push(event),
    });

    expect(images).toEqual({});
    expect(events).toEqual([
      {
        step: "images",
        status: "skipped",
        detail: "依設定不產生配圖，全部頁面以純版面呈現",
      },
    ]);
  });

  describe("when the tenant model has no credentials", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.GPT_IMAGE_ENDPOINT;
      delete process.env.GPT_IMAGE_API_KEY;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("records a failed step and lets authoring continue without pictures", async () => {
      const events = [];

      const images = await generateDeckImages({
        deckId: "deck",
        jobId: "job",
        outline: outlineOf([slide(), slide({ slide_number: 2 })]),
        model: "gpt-image-2",
        onProgress: async (event) => events.push(event),
      });

      expect(images).toEqual({});
      expect(events).toEqual([
        {
          step: "images",
          status: "failed",
          detail: "圖片生成模型 gpt-image-2 尚未設定，2 頁改以純版面呈現",
        },
      ]);
    });
  });
});
