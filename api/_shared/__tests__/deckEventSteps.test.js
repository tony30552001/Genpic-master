import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { DECK_STEPS } from "../deckContract";

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../db/migrations");

/**
 * `recordDeckJobEvent` writes one row per pipeline step, and `deck_job_events.step`
 * is constrained to a fixed list. Adding a step to `DECK_STEPS` without widening
 * that constraint does not fail a unit test — it fails every deck job in
 * production, at the exact moment the new step first reports. This test is the
 * cheap version of finding that out.
 */
const readStepConstraint = () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
  let allowed = null;
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const match = /CHECK\s*\(\s*step\s+IN\s*\(([^)]*)\)/i.exec(sql);
    if (!match) continue;
    allowed = [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
  }
  return allowed;
};

describe("deck_job_events step constraint", () => {
  it("permits every step the worker reports", () => {
    const allowed = readStepConstraint();
    expect(allowed).not.toBeNull();
    for (const step of DECK_STEPS) {
      expect(allowed).toContain(step);
    }
  });

  it("does not permit steps the worker never reports", () => {
    expect([...readStepConstraint()].sort()).toEqual([...DECK_STEPS].sort());
  });
});
