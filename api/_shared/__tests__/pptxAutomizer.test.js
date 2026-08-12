import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { generatePresentationPptx } = require("../pptxAutomizer");
const { normalizePresentationSlides } = require("../presentationSchema");

describe("pptxAutomizer", () => {
  it("normalizes presentation slides for company template export", () => {
    const slides = normalizePresentationSlides([
      {
        slide_number: 1,
        slide_type: "cover",
        title: "公司簡報",
        subtitle: "年度摘要",
      },
    ]);

    expect(slides[0]).toMatchObject({
      slide_number: 1,
      slide_type: "cover",
      title: "公司簡報",
    });
  });

  it("generates a valid PPTX archive with native visuals", async () => {
    const buffer = await generatePresentationPptx({
      slides: [
        {
          slide_number: 1,
          slide_type: "cover",
          title: "營收概覽",
          subtitle: "季度營收持續成長",
        },
        {
          slide_number: 2,
          slide_type: "content",
          title: "營收趨勢",
          bullets: ["Q2 高於 Q1"],
          table: {
            headers: ["季度", "營收"],
            rows: [["Q1", "100"], ["Q2", "120"]],
          },
          chart: {
            type: "bar",
            labels: ["Q1", "Q2"],
            series: [{ name: "營收", values: [100, 120] }],
          },
        },
      ],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.subarray(0, 2).toString()).toBe("PK");
    expect(buffer.length).toBeGreaterThan(1000);
  });
});
