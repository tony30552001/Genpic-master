import { afterEach, describe, expect, it, vi } from "vitest";
import { imageUrlToFile, nearestAspectRatio, pastedImageFile } from "../imageFile";

afterEach(() => vi.unstubAllGlobals());

describe("nearestAspectRatio", () => {
  it.each([
    [1024, 1024, "1:1"],
    [1920, 1080, "16:9"],
    [1080, 1920, "9:16"],
    [1200, 900, "4:3"],
    [3000, 2000, "3:2"],
    [2520, 1080, "21:9"],
    [1000, 1250, "4:5"],
  ])("maps %ix%i to %s", (width, height, expected) => {
    expect(nearestAspectRatio(width, height)).toBe(expected);
  });

  it("falls back to square for unknown sizes", () => {
    expect(nearestAspectRatio(0, 100)).toBe("1:1");
    expect(nearestAspectRatio(undefined, undefined)).toBe("1:1");
  });
});

describe("pastedImageFile", () => {
  const image = new File(["png"], "image.png", { type: "image/png" });
  const clipboard = (text, items) => ({
    clipboardData: {
      getData: () => text,
      items: items.map((file) => ({ kind: "file", type: file.type, getAsFile: () => file })),
    },
  });

  it("returns the pasted image", () => {
    expect(pastedImageFile(clipboard("", [image]))).toBe(image);
  });

  it("leaves text pastes and non-image files alone", () => {
    expect(pastedImageFile(clipboard("儲存格文字", [image]))).toBeNull();
    expect(pastedImageFile(clipboard("", [new File(["x"], "a.pdf", { type: "application/pdf" })]))).toBeNull();
  });
});

describe("imageUrlToFile", () => {
  it("names the file after the image type", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(["jpg"], { type: "image/jpeg" }),
    })));
    const file = await imageUrlToFile("https://blob/a.jpg", "result");
    expect(file.name).toBe("result.jpeg");
    expect(file.type).toBe("image/jpeg");
  });

  it("fails when the image cannot be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    await expect(imageUrlToFile("https://blob/a.jpg", "result")).rejects.toThrow("無法取得目前的圖片");
  });
});
