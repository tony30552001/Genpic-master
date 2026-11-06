import { describe, expect, it } from "vitest";

import { filterHistoryItems, groupByDay } from "../galleryUtils";

const NOW = new Date(2026, 10, 6, 15, 0, 0);
const at = (y, m, d, h = 12) => ({ seconds: Math.floor(new Date(y, m, d, h).getTime() / 1000) });

describe("groupByDay", () => {
  it("groups newest first with relative labels", () => {
    const items = [
      { id: "old", createdAt: at(2026, 10, 1) },
      { id: "today-a", createdAt: at(2026, 10, 6, 9) },
      { id: "yesterday", createdAt: at(2026, 10, 5) },
      { id: "today-b", createdAt: at(2026, 10, 6, 14) },
      { id: "undated" },
    ];

    const groups = groupByDay(items, NOW);

    expect(groups.map((group) => group.label)).toEqual(["今天", "昨天", "11月1日", "更早"]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["today-b", "today-a"]);
  });
});

describe("filterHistoryItems", () => {
  const items = [
    { id: "a", userScript: "夏季海灘促銷", styleId: "s1" },
    { id: "b", userScript: "團隊簡報封面" },
  ];
  const styleMap = { s1: { name: "極簡科技藍", tags: ["簡報"] } };

  it("matches script, style name and style tags", () => {
    expect(filterHistoryItems(items, "海灘", styleMap).map((item) => item.id)).toEqual(["a"]);
    expect(filterHistoryItems(items, "科技藍", styleMap).map((item) => item.id)).toEqual(["a"]);
    expect(filterHistoryItems(items, "簡報", styleMap).map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("returns everything for a blank query", () => {
    expect(filterHistoryItems(items, "  ", styleMap)).toBe(items);
  });
});
