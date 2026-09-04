import { describe, expect, it } from "vitest";

import { getImageOutputLabel } from "../imageOutput";

describe("getImageOutputLabel", () => {
  it("maps GPT Image ratios to their displayed pixel dimensions", () => {
    expect(
      getImageOutputLabel({
        aspectRatio: "16:9",
      })
    ).toBe("1536×1024");
  });

  it("uses the aspect ratio to describe the rendered resolution", () => {
    expect(
      getImageOutputLabel({
        aspectRatio: "1:1",
      })
    ).toBe("1024×1024");
  });
});
