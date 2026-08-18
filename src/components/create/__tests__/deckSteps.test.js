import { describe, expect, it } from "vitest";

import { DECK_STEPS, activeStepIndex, authoringSlideNumber, buildTimeline } from "../deckSteps";

const event = (id, step, status, extra = {}) => ({ id, step, status, ...extra });

describe("authoringSlideNumber", () => {
  it("has no active page before any slide event", () => {
    expect(authoringSlideNumber([])).toBeNull();
    expect(authoringSlideNumber([event(1, "outline", "running")])).toBeNull();
  });

  it("reports the page whose latest event is still running", () => {
    const events = [
      event(1, "slides", "running", { slideNumber: 1 }),
      event(2, "slides", "succeeded", { slideNumber: 1 }),
      event(3, "slides", "running", { slideNumber: 2 }),
    ];
    expect(authoringSlideNumber(events)).toBe(2);
  });

  it("clears the active page once it succeeds", () => {
    const events = [
      event(2, "slides", "succeeded", { slideNumber: 1 }),
      event(1, "slides", "running", { slideNumber: 1 }),
    ];
    expect(authoringSlideNumber(events)).toBeNull();
  });

  it("ignores per-slide illustration events", () => {
    const events = [event(1, "images", "running", { slideNumber: 3 })];
    expect(authoringSlideNumber(events)).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("returns every step as pending when there are no events", () => {
    const steps = buildTimeline([]);
    expect(steps).toHaveLength(DECK_STEPS.length);
    expect(steps.every((step) => step.status === "pending")).toBe(true);
    expect(steps.map((step) => step.id)).toEqual(DECK_STEPS.map((step) => step.id));
  });

  it("uses the latest step-level event as the step status", () => {
    const steps = buildTimeline([
      event(1, "outline", "running", { detail: "規劃中" }),
      event(2, "outline", "succeeded", { detail: "8 頁大綱" }),
    ]);
    const outline = steps.find((step) => step.id === "outline");
    expect(outline.status).toBe("succeeded");
    expect(outline.detail).toBe("8 頁大綱");
  });

  it("groups slide events under their step and keeps the latest state per slide", () => {
    const steps = buildTimeline([
      event(1, "slides", "running"),
      event(2, "slides", "running", { slideNumber: 2, detail: "設計第 2 頁" }),
      event(3, "slides", "running", { slideNumber: 1, detail: "設計第 1 頁" }),
      event(4, "slides", "succeeded", { slideNumber: 1, detail: "第 1 頁完成" }),
    ]);
    const slides = steps.find((step) => step.id === "slides");
    expect(slides.status).toBe("running");
    expect(slides.items).toEqual([
      { slideNumber: 1, status: "succeeded", detail: "第 1 頁完成" },
      { slideNumber: 2, status: "running", detail: "設計第 2 頁" },
    ]);
  });

  it("orders events by id even when they arrive out of order", () => {
    const steps = buildTimeline([
      event(9, "export", "succeeded"),
      event(3, "export", "running"),
    ]);
    expect(steps.find((step) => step.id === "export").status).toBe("succeeded");
  });

  it("keeps skipped steps distinct from pending ones", () => {
    const steps = buildTimeline([event(1, "images", "skipped", { detail: "沒有需要配圖的頁面" })]);
    const images = steps.find((step) => step.id === "images");
    expect(images.status).toBe("skipped");
    expect(images.detail).toBe("沒有需要配圖的頁面");
  });

  it("ignores unknown steps", () => {
    const steps = buildTimeline([event(1, "unknown", "running")]);
    expect(steps.every((step) => step.status === "pending")).toBe(true);
  });
});

describe("activeStepIndex", () => {
  it("points at the running step", () => {
    const steps = buildTimeline([
      event(1, "source", "succeeded"),
      event(2, "outline", "running"),
    ]);
    expect(activeStepIndex(steps)).toBe(1);
  });

  it("points at the failed step", () => {
    const steps = buildTimeline([
      event(1, "source", "succeeded"),
      event(2, "outline", "failed"),
    ]);
    expect(activeStepIndex(steps)).toBe(1);
  });

  it("returns -1 when nothing is active", () => {
    expect(activeStepIndex(buildTimeline([]))).toBe(-1);
  });
});
