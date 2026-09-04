import { describe, expect, it } from "vitest";

import { DEFAULT_IMAGE_MODEL } from "../../config";
import { formatElapsedSeconds, getGenerationStatus } from "../generationProgress";

describe("generationProgress", () => {
  it("formats elapsed seconds", () => {
    expect(formatElapsedSeconds(0)).toBe("0s");
    expect(formatElapsedSeconds(9)).toBe("9s");
    expect(formatElapsedSeconds(65)).toBe("1:05");
  });

  it("paces phases for the only supported image model and caps progress", () => {
    expect(DEFAULT_IMAGE_MODEL).toBe("gpt-image-2");
    expect(getGenerationStatus({ elapsedSeconds: 2 }).phase).toBe("preparing");
    expect(getGenerationStatus({ elapsedSeconds: 12 }).phase).toBe("composing");

    const longWait = getGenerationStatus({ elapsedSeconds: 180 });
    expect(longWait.phase).toBe("waiting");
    expect(longWait.waitLevel).toBe("extended");
    expect(longWait.progress).toBeLessThanOrEqual(95);
  });

  it("marks 30-second waits as slow", () => {
    const status = getGenerationStatus({ elapsedSeconds: 30 });

    expect(status.waitLevel).toBe("slow");
    expect(status.helperText).toContain("文字");
  });
});
