import { describe, expect, it } from "vitest";

import { getImageOutputLabel } from "../imageOutput";

describe("getImageOutputLabel", () => {
  it("maps GPT Image ratios to their displayed pixel dimensions", () => {
    expect(
      getImageOutputLabel({
        imageModel: "gpt-image-2",
        aspectRatio: "16:9",
        imageSize: "4K",
      })
    ).toBe("1536×1024");
  });

  it("uses the selected resolution for models without size mapping", () => {
    expect(
      getImageOutputLabel({
        imageModel: "gemini-imagen",
        aspectRatio: "1:1",
        imageSize: "2K",
      })
    ).toBe("2K");
  });
});
