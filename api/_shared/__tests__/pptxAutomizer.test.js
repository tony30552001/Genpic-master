import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generatePresentationPptx, normalizeScenes } = require("../pptxAutomizer");

describe("pptxAutomizer", () => {
  it("keeps embedded images while normalizing export scenes", () => {
    const scenes = normalizeScenes([
      {
        scene_number: 1,
        scene_title: "封面",
        scene_description: "簡報摘要",
        generatedImage: "data:image/png;base64,AAAA",
      },
    ]);

    expect(scenes[0]).toMatchObject({
      scene_number: 1,
      generatedImage: "data:image/png;base64,AAAA",
    });
  });

  it("generates a valid PPTX archive with native visuals", async () => {
    const buffer = await generatePresentationPptx({
      scenes: [
        {
          scene_number: 1,
          scene_title: "營收概覽",
          scene_description: "季度營收持續成長",
          bullet_points: ["Q2 高於 Q1"],
          tables: [
            {
              headers: ["季度", "營收"],
              rows: [["Q1", "100"], ["Q2", "120"]],
            },
          ],
          charts: [
            {
              type: "bar",
              labels: ["Q1", "Q2"],
              series: [{ name: "營收", values: [100, 120] }],
            },
          ],
        },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
