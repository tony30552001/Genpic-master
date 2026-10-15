import { describe, expect, it } from "vitest";
import { HISTORY_SOURCE_LABELS, getHistorySourceLabel } from "../historySource";
import { ATTACHMENT_PURPOSES, REFERENCE_PURPOSE } from "../attachmentPurposes";

describe("history source labels", () => {
  it("labels every transform purpose", () => {
    for (const purpose of ATTACHMENT_PURPOSES.filter(({ id }) => id !== REFERENCE_PURPOSE)) {
      expect(getHistorySourceLabel(purpose.id)).not.toBe("—");
    }
    expect(getHistorySourceLabel("refine")).toBe("修改這張");
  });

  it("keeps the legacy transform label and an unknown label", () => {
    expect(getHistorySourceLabel("image-transform")).toBe("圖片轉換");
    expect(getHistorySourceLabel(null)).toBe("未記錄");
    expect(HISTORY_SOURCE_LABELS.map(({ id }) => id)).toContain("general");
  });
});
