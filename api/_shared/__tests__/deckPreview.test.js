import { describe, expect, it, vi } from "vitest";

import { inlineSlideImages, listSlideImageNames } from "../deckPreview";

const svgWith = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" data-pptx-page-role="content">${body}</svg>`;

describe("deckPreview", () => {
  it("lists distinct workspace image names", () => {
    const svg = svgWith(
      `<image href="../images/slide_01.png" x="0" y="0" width="640" height="360"/>` +
        `<image xlink:href="../images/slide_01.png" x="0" y="0" width="10" height="10"/>` +
        `<image href="../images/slide_02.jpg" x="0" y="0" width="10" height="10"/>`
    );

    expect(listSlideImageNames(svg)).toEqual(["slide_01.png", "slide_02.jpg"]);
  });

  it("inlines both href and xlink:href references as data URLs", async () => {
    const svg = svgWith(
      `<image href="../images/slide_01.png" x="0" y="0" width="640" height="360"/>` +
        `<image xlink:href="../images/slide_02.jpg" x="0" y="0" width="10" height="10"/>`
    );

    const result = await inlineSlideImages(svg, async (name) => ({
      buffer: Buffer.from(name),
      contentType: name.endsWith(".jpg") ? "image/jpeg" : "image/png",
    }));

    expect(result).toContain(
      `href="data:image/png;base64,${Buffer.from("slide_01.png").toString("base64")}"`
    );
    expect(result).toContain(
      `xlink:href="data:image/jpeg;base64,${Buffer.from("slide_02.jpg").toString("base64")}"`
    );
    expect(result).not.toContain("../images/");
  });

  it("keeps the original reference when an image cannot be resolved", async () => {
    const svg = svgWith(`<image href="../images/slide_01.png" width="10" height="10"/>`);

    const missing = await inlineSlideImages(svg, async () => null);
    expect(missing).toBe(svg);

    const failing = await inlineSlideImages(svg, async () => {
      throw new Error("blob not found");
    });
    expect(failing).toBe(svg);
  });

  it("leaves a slide without workspace images untouched and resolves nothing", async () => {
    const svg = svgWith(`<text x="80" y="200" font-size="48">沒有配圖</text>`);
    const resolve = vi.fn();

    expect(await inlineSlideImages(svg, resolve)).toBe(svg);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not rewrite references outside the workspace images folder", async () => {
    const svg = svgWith(
      `<image href="https://example.com/logo.png" width="10" height="10"/>` +
        `<image href="../../etc/passwd" width="10" height="10"/>`
    );
    const resolve = vi.fn();

    expect(await inlineSlideImages(svg, resolve)).toBe(svg);
    expect(resolve).not.toHaveBeenCalled();
  });
});
