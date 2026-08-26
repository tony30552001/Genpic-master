import { describe, expect, it } from "vitest";
import {
  buildTemplateInstruction,
  normalizeTemplateContext,
} from "../templateContext";

const validContext = {
  version: 1,
  id: "infographic",
  outputType: "infographic",
  title: "資訊圖引擎",
  purpose: "infographic",
  moduleCount: 4,
  informationFlow: "橫向流程",
  guidance: ["保留清楚的閱讀順序。"],
  pitfalls: ["避免長段正文。"],
};

describe("normalizeTemplateContext", () => {
  it("normalizes a supported context while keeping the selected settings", () => {
    expect(normalizeTemplateContext(validContext)).toEqual({
      ...validContext,
    });
  });

  it("rejects unsupported template settings", () => {
    expect(() =>
      normalizeTemplateContext({
        ...validContext,
        id: "unknown",
      })
    ).toThrow("templateContext 含有不受支援的範本");

    expect(() =>
      normalizeTemplateContext({
        ...validContext,
        moduleCount: 99,
      })
    ).toThrow("templateContext moduleCount 不受支援");
  });

  it("omits optional context cleanly", () => {
    expect(normalizeTemplateContext(undefined)).toBeNull();
  });
});

describe("buildTemplateInstruction", () => {
  it("turns the normalized context into explicit generation rules", () => {
    const instruction = buildTemplateInstruction(validContext);

    expect(instruction).toContain("資訊圖引擎");
    expect(instruction).toContain("exactly 4 visual modules");
    expect(instruction).toContain("橫向流程");
    expect(instruction).toContain("避免長段正文");
  });
});
