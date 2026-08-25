import { describe, expect, it } from "vitest";

import {
  MIN_SLIDES_FOR_CONFIDENCE,
  buildRepairReport,
  formatRepairReport,
} from "../deckRepairStats.js";

const SPLIT = new Date("2026-08-25T07:20:00Z");
const BEFORE = new Date("2026-08-24T00:00:00Z");
const AFTER = new Date("2026-08-26T00:00:00Z");

const jobRow = (overrides) => ({
  job_id: "job-1",
  job_status: "succeeded",
  started_at: BEFORE,
  completed_at: BEFORE,
  step: null,
  event_status: null,
  slide_number: null,
  detail: null,
  ...overrides,
});

const slideDone = (slideNumber, detail, overrides = {}) =>
  jobRow({
    step: "slides",
    event_status: "succeeded",
    slide_number: slideNumber,
    detail,
    ...overrides,
  });

const report = (rows, options = {}) =>
  buildRepairReport(rows, { splitAt: SPLIT, ...options });

describe("buildRepairReport", () => {
  it("counts a slide with no repair parenthetical as clean", () => {
    const result = report([slideDone(1, "第 1 頁完成")]);

    expect(result.before.slides).toBe(1);
    expect(result.before.localRepairs).toBe(0);
    expect(result.before.slidesNeedingLocalRepair).toBe(0);
    expect(result.before.cleanSlideRate).toBe(1);
  });

  it("reads the local repair count out of the detail string", () => {
    const result = report([
      slideDone(1, "第 1 頁完成"),
      slideDone(2, "第 2 頁完成（自我修正 2 次）"),
    ]);

    expect(result.before.slides).toBe(2);
    expect(result.before.localRepairs).toBe(2);
    expect(result.before.slidesNeedingLocalRepair).toBe(1);
    expect(result.before.cleanSlideRate).toBe(0.5);
  });

  it("reports an unrecognised detail instead of counting it as a clean slide", () => {
    const result = report([
      slideDone(1, "第 1 頁完成"),
      slideDone(2, "page 2 finished"),
    ]);

    expect(result.before.slides).toBe(1);
    expect(result.before.unparsedSlideDetails).toBe(1);
    expect(result.before.cleanSlideRate).toBe(1);
  });

  it("counts every gate round as a rewrite but the slide only once", () => {
    const gate = (slideNumber, detail) =>
      jobRow({
        step: "quality",
        event_status: "succeeded",
        slide_number: slideNumber,
        detail,
      });

    const result = report([
      slideDone(1, "第 1 頁完成"),
      gate(1, "第 1 頁已修正（第 1 輪）"),
      gate(1, "第 1 頁已修正（第 2 輪）"),
    ]);

    expect(result.before.gateRepairs).toBe(2);
    expect(result.before.slidesNeedingGateRepair).toBe(1);
    expect(result.before.maxGateRound).toBe(2);
  });

  it("keeps gate repairs on the same slide number of different decks apart", () => {
    const gate = (jobId, detail) =>
      jobRow({
        job_id: jobId,
        step: "quality",
        event_status: "succeeded",
        slide_number: 1,
        detail,
      });

    const result = report([
      gate("job-1", "第 1 頁已修正（第 1 輪）"),
      gate("job-2", "第 1 頁已修正（第 1 輪）"),
    ]);

    expect(result.before.slidesNeedingGateRepair).toBe(2);
  });

  it("counts a failed slides event as a hard failure, not an authored slide", () => {
    const result = report([
      jobRow({
        job_status: "failed",
        step: "slides",
        event_status: "failed",
        slide_number: 3,
        detail: "第 3 頁產生失敗",
      }),
    ]);

    expect(result.before.hardFailures).toBe(1);
    expect(result.before.slides).toBe(0);
    expect(result.before.unparsedSlideDetails).toBe(0);
  });

  it("adds local and gate rewrites into the per-slide cost", () => {
    const result = report([
      slideDone(1, "第 1 頁完成（自我修正 1 次）"),
      slideDone(2, "第 2 頁完成"),
      jobRow({
        step: "quality",
        event_status: "succeeded",
        slide_number: 2,
        detail: "第 2 頁已修正（第 1 輪）",
      }),
    ]);

    expect(result.before.rewrites).toBe(2);
    expect(result.before.rewritesPerSlide).toBe(1);
  });

  it("assigns a deck to a cohort by when it started", () => {
    const result = report([
      slideDone(1, "第 1 頁完成", {
        job_id: "old",
        started_at: BEFORE,
        completed_at: BEFORE,
      }),
      slideDone(1, "第 1 頁完成（自我修正 3 次）", {
        job_id: "new",
        started_at: AFTER,
        completed_at: AFTER,
      }),
    ]);

    expect(result.before.slides).toBe(1);
    expect(result.before.localRepairs).toBe(0);
    expect(result.after.slides).toBe(1);
    expect(result.after.localRepairs).toBe(3);
  });

  it("treats a deck started exactly at the split as after it", () => {
    const result = report([
      slideDone(1, "第 1 頁完成", { started_at: SPLIT, completed_at: SPLIT }),
    ]);

    expect(result.after.slides).toBe(1);
    expect(result.before.slides).toBe(0);
  });

  it("reports a deck that started before the split and finished after it", () => {
    const result = report([
      slideDone(1, "第 1 頁完成", { started_at: BEFORE, completed_at: AFTER }),
    ]);

    expect(result.straddlingDecks).toBe(1);
    expect(result.before.decks).toBe(1);
  });

  it("does not call an unfinished deck straddling", () => {
    const result = report([
      slideDone(1, "第 1 頁完成", { started_at: BEFORE, completed_at: null }),
    ]);

    expect(result.straddlingDecks).toBe(0);
  });

  it("counts a deck that produced no events at all", () => {
    const result = report([jobRow({ job_status: "failed", step: null })]);

    expect(result.before.decks).toBe(1);
    expect(result.before.decksFailed).toBe(1);
    expect(result.before.deckFailureRate).toBe(1);
    expect(result.before.slides).toBe(0);
  });

  it("counts each deck once however many events it emitted", () => {
    const result = report([
      slideDone(1, "第 1 頁完成"),
      slideDone(2, "第 2 頁完成"),
      slideDone(3, "第 3 頁完成"),
    ]);

    expect(result.before.decks).toBe(1);
    expect(result.before.decksSucceeded).toBe(1);
    expect(result.before.deckFailureRate).toBe(0);
  });

  it("returns nulls rather than dividing by zero for an empty cohort", () => {
    const result = report([]);

    expect(result.after.decks).toBe(0);
    expect(result.after.deckFailureRate).toBeNull();
    expect(result.after.rewritesPerSlide).toBeNull();
    expect(result.after.cleanSlideRate).toBeNull();
  });

  it("records the boundaries it was given", () => {
    const result = report([], { since: BEFORE });

    expect(result.splitAt).toBe(SPLIT.toISOString());
    expect(result.since).toBe(BEFORE.toISOString());
  });

  it("leaves since null when no lower bound was given", () => {
    expect(report([]).since).toBeNull();
  });
});

describe("formatRepairReport", () => {
  const cleanCohort = (jobId, startedAt) =>
    Array.from({ length: MIN_SLIDES_FOR_CONFIDENCE }, (_, index) =>
      slideDone(index + 1, `第 ${index + 1} 頁完成`, {
        job_id: jobId,
        started_at: startedAt,
        completed_at: startedAt,
      })
    );

  it("warns that a thin cohort is only directional", () => {
    const text = formatRepairReport(report([slideDone(1, "第 1 頁完成")]));

    expect(text).toContain("before and after cohort has fewer than 30");
  });

  it("drops the thin-cohort warning once both sides have enough slides", () => {
    const text = formatRepairReport(
      report([...cleanCohort("old", BEFORE), ...cleanCohort("new", AFTER)])
    );

    expect(text).not.toContain("fewer than");
  });

  it("warns when a detail string could not be parsed", () => {
    const text = formatRepairReport(report([slideDone(1, "page 1 finished")]));

    expect(text).toContain("1 slide event(s) did not match");
  });

  it("stays silent about parsing when every detail was understood", () => {
    const text = formatRepairReport(report([slideDone(1, "第 1 頁完成")]));

    expect(text).not.toContain("did not match");
  });

  it("notes decks that straddle the split", () => {
    const text = formatRepairReport(
      report([slideDone(1, "第 1 頁完成", { completed_at: AFTER })])
    );

    expect(text).toContain("1 deck(s) started before the split");
  });

  it("shows n/a instead of a number for an empty cohort", () => {
    const text = formatRepairReport(report([slideDone(1, "第 1 頁完成")]));

    expect(text).toMatch(/rewrites \/ slide\s+0\.00\s+n\/a/);
  });
});
