import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createStoryboardProgress, finishedShots } = require("../videoStoryboardProgress");

afterEach(() => vi.useRealTimers());

describe("finishedShots", () => {
  const head = '{"storyboard":{"title":"清潔","shots":[{"id":"s1","title":null,"script":"推車停在門口","duration":5},';

  it("leaves out the shot that is still streaming and fills titles from the scenes", () => {
    expect(finishedShots(`${head}{"id":"s2","script":"拿起除`, ["作業前準備", "高處除塵"])).toEqual([
      { title: "作業前準備", duration: 5, text: "推車停在門口" },
    ]);
  });

  it("counts the last shot once a later key closes the list", () => {
    const text = `${head}{"id":"s2","title":"除塵","action":"擦拭燈罩","duration":8}]},"explanation":"`;
    expect(finishedShots(text, []).map((shot) => shot.title)).toEqual([null, "除塵"]);
  });

  it("returns nothing before the reply has a parsable prefix", () => {
    expect(finishedShots("", [])).toEqual([]);
  });
});

describe("createStoryboardProgress", () => {
  it("writes steps at once, batches streamed text, and writes nothing after close", async () => {
    vi.useFakeTimers();
    const saved = [];
    const progress = createStoryboardProgress({
      steps: ["thinking", "writing", "checking"],
      save: async (snapshot) => saved.push(JSON.parse(snapshot)),
    });

    progress.step("thinking");
    progress.reasoning("規劃");
    progress.reasoning("三幕");
    progress.text('{"storyboard":{"shots":[{"id":"s1","action":"開門","duration":5},');
    progress.text('{"id":"s2"');
    await vi.advanceTimersByTimeAsync(0);
    expect(saved.map((item) => item.step)).toEqual(["thinking", "writing"]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(saved.at(-1)).toMatchObject({
      step: "writing",
      reasoning: "規劃三幕",
      shots: [{ title: null, duration: 5, text: "開門" }],
    });

    progress.restart();
    progress.step("checking");
    await progress.close();
    progress.reasoning("太晚");
    await vi.advanceTimersByTimeAsync(2000);
    expect(saved.at(-1)).toMatchObject({ step: "checking", reasoning: "", shots: [] });
    expect(saved.some((item) => item.reasoning === "太晚")).toBe(false);
  });
});
