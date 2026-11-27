import { describe, expect, it } from "vitest";
import { regeneratedSegments } from "../segmentEdit";

const shot = (id, action) => ({ id, action, durationSeconds: 5 });
const storyboard = { title: "晨光", global: { style: "寫實" }, shots: [shot("s1", "走"), shot("s2", "跑"), shot("s3", "停"), shot("s4", "看")] };
const plan = [
  { index: 0, shotIds: ["s1"], chained: false },
  { index: 1, shotIds: ["s2"], chained: true },
  { index: 2, shotIds: ["s3"], chained: true },
  { index: 3, shotIds: ["s4"], chained: false },
];
const previous = {
  storyboard,
  segments: plan.map((segment) => ({ ...segment, status: "succeeded" })),
};
const edit = (id, action) => ({
  ...storyboard,
  shots: storyboard.shots.map((item) => (item.id === id ? { ...item, action } : item)),
});

describe("regeneratedSegments", () => {
  it("regenerates an edited segment and the chained segments after it", () => {
    expect(regeneratedSegments({ plan, storyboard: edit("s2", "衝刺"), previous })).toEqual([1, 2]);
  });

  it("regenerates nothing when the storyboard is unchanged, regardless of key order", () => {
    const reordered = { ...storyboard, shots: storyboard.shots.map(({ durationSeconds, id, action }) => ({ durationSeconds, id, action })) };
    expect(regeneratedSegments({ plan, storyboard: reordered, previous })).toEqual([]);
  });

  it("regenerates failed segments and every segment when the header changes", () => {
    const failed = { ...previous, segments: previous.segments.map((segment) => segment.index === 3 ? { ...segment, status: "failed" } : segment) };
    expect(regeneratedSegments({ plan, storyboard, previous: failed })).toEqual([3]);
    expect(regeneratedSegments({ plan, storyboard: { ...storyboard, title: "黃昏" }, previous })).toEqual([0, 1, 2, 3]);
  });
});
