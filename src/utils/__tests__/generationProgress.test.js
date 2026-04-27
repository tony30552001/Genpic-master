import { describe, expect, it } from "vitest";

import { DEFAULT_IMAGE_MODEL } from "../../config";
import { formatElapsedSeconds, getGenerationStatus } from "../generationProgress";

describe("generationProgress", () => {
  it("formats elapsed seconds", () => {
    expect(formatElapsedSeconds(0)).toBe("0s");
    expect(formatElapsedSeconds(9)).toBe("9s");
    expect(formatElapsedSeconds(65)).toBe("1:05");
  });

  it("uses longer gpt-image-2 phases and caps progress", () => {
    expect(getGenerationStatus({ elapsedSeconds: 2, model: "gpt-image-2" }).phase).toBe("preparing");
    expect(getGenerationStatus({ elapsedSeconds: 12, model: "gpt-image-2" }).phase).toBe("composing");

    const longWait = getGenerationStatus({ elapsedSeconds: 180, model: "gpt-image-2" });
    expect(longWait.phase).toBe("waiting");
    expect(longWait.waitLevel).toBe("extended");
    expect(longWait.progress).toBeLessThanOrEqual(95);
  });

  it("marks 30-second waits as slow", () => {
    const status = getGenerationStatus({ elapsedSeconds: 30, model: "gpt-image-2" });

    expect(status.waitLevel).toBe("slow");
    expect(status.helperText).toContain("文字");
  });

  it("defaults progress timing to the configured default image model", () => {
    expect(DEFAULT_IMAGE_MODEL).toBe("gemini-imagen");
    expect(getGenerationStatus({ elapsedSeconds: 12 }).phase).toBe("composing");
  });
});
