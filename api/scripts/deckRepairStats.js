/**
 * Aggregation for the deck repair-cost report.
 *
 * Every re-authoring round is a full slide rewrite: the whole previous SVG goes
 * back to the model inside another authoring call. Repairs, not the first
 * draft, are what a deck actually costs, so this reports repairs per authored
 * slide and splits the population at a deploy boundary to compare before and
 * after.
 *
 * The counts are not stored as columns. The worker records them inside the
 * Chinese `detail` string it writes for the browser timeline, so this parses
 * that string rather than adding a schema or changing production behaviour.
 * Rows that do not parse are reported instead of being counted as zero.
 */

/** `第 3 頁完成（自我修正 2 次）` — the page finished, after N local rewrites. */
const SLIDE_DONE = /^第\s*\d+\s*頁完成/;
const LOCAL_REPAIRS = /自我修正\s*(\d+)\s*次/;
/** `第 3 頁已修正（第 1 輪）` — one gate-driven rewrite in round R. */
const GATE_ROUND = /第\s*(\d+)\s*輪/;

/** Below this many authored slides a cohort is directional, not conclusive. */
const MIN_SLIDES_FOR_CONFIDENCE = 30;

const emptyCohort = () => ({
  decks: 0,
  decksSucceeded: 0,
  decksFailed: 0,
  slides: 0,
  localRepairs: 0,
  slidesNeedingLocalRepair: 0,
  gateRepairs: 0,
  slidesNeedingGateRepair: new Set(),
  maxGateRound: 0,
  hardFailures: 0,
  unparsedSlideDetails: 0,
});

const summarizeCohort = (cohort) => {
  const rewrites = cohort.localRepairs + cohort.gateRepairs;
  return {
    decks: cohort.decks,
    decksSucceeded: cohort.decksSucceeded,
    decksFailed: cohort.decksFailed,
    deckFailureRate: cohort.decks ? cohort.decksFailed / cohort.decks : null,
    slides: cohort.slides,
    localRepairs: cohort.localRepairs,
    slidesNeedingLocalRepair: cohort.slidesNeedingLocalRepair,
    gateRepairs: cohort.gateRepairs,
    slidesNeedingGateRepair: cohort.slidesNeedingGateRepair.size,
    maxGateRound: cohort.maxGateRound,
    hardFailures: cohort.hardFailures,
    unparsedSlideDetails: cohort.unparsedSlideDetails,
    rewrites,
    rewritesPerSlide: cohort.slides ? rewrites / cohort.slides : null,
    cleanSlideRate: cohort.slides
      ? 1 - cohort.slidesNeedingLocalRepair / cohort.slides
      : null,
  };
};

/**
 * Fold the job/event join into a before/after report.
 *
 * `rows` is one row per event, left-joined onto its job, ordered by job. A job
 * with no events still yields one row with a null `step`.
 */
const buildRepairReport = (rows, { splitAt, since = null }) => {
  const cohorts = { before: emptyCohort(), after: emptyCohort() };
  const jobs = new Map();

  for (const row of rows) {
    if (!jobs.has(row.job_id)) {
      // A job belongs to the code version that was running when it started, so
      // a deck that straddles the deploy is reported rather than silently
      // assigned to one side.
      jobs.set(row.job_id, {
        status: row.job_status,
        era: row.started_at >= splitAt ? "after" : "before",
        straddles:
          row.started_at < splitAt &&
          row.completed_at != null &&
          row.completed_at >= splitAt,
      });
    }

    const job = jobs.get(row.job_id);
    const cohort = cohorts[job.era];
    if (!row.step) continue;

    if (row.step === "slides" && row.event_status === "failed") {
      cohort.hardFailures += 1;
      continue;
    }

    if (
      row.step === "slides" &&
      row.event_status === "succeeded" &&
      row.slide_number != null
    ) {
      const detail = row.detail || "";
      if (!SLIDE_DONE.test(detail)) {
        cohort.unparsedSlideDetails += 1;
        continue;
      }
      cohort.slides += 1;
      const repaired = detail.match(LOCAL_REPAIRS);
      if (repaired) {
        cohort.localRepairs += Number(repaired[1]);
        cohort.slidesNeedingLocalRepair += 1;
      }
      continue;
    }

    if (
      row.step === "quality" &&
      row.event_status === "succeeded" &&
      row.slide_number != null
    ) {
      cohort.gateRepairs += 1;
      cohort.slidesNeedingGateRepair.add(`${row.job_id}:${row.slide_number}`);
      const round = (row.detail || "").match(GATE_ROUND);
      if (round) {
        cohort.maxGateRound = Math.max(cohort.maxGateRound, Number(round[1]));
      }
    }
  }

  let straddlingDecks = 0;
  for (const job of jobs.values()) {
    const cohort = cohorts[job.era];
    cohort.decks += 1;
    if (job.status === "succeeded") cohort.decksSucceeded += 1;
    if (job.status === "failed") cohort.decksFailed += 1;
    if (job.straddles) straddlingDecks += 1;
  }

  return {
    splitAt: splitAt.toISOString(),
    since: since ? since.toISOString() : null,
    straddlingDecks,
    before: summarizeCohort(cohorts.before),
    after: summarizeCohort(cohorts.after),
  };
};

const formatRepairReport = (report) => {
  const pct = (value) => (value == null ? "n/a" : `${(value * 100).toFixed(1)}%`);
  const num = (value) => (value == null ? "n/a" : value.toFixed(2));

  const lines = [];
  const line = (label, before, after) =>
    lines.push(
      `${label.padEnd(28)} ${String(before).padStart(12)} ${String(after).padStart(12)}`
    );
  const rule = () => lines.push("".padEnd(54, "-"));

  lines.push(`Deck repair cost, split at ${report.splitAt}`);
  if (report.since) {
    lines.push(`Jobs started before ${report.since} are excluded.`);
  }
  rule();
  line("", "before", "after");
  rule();
  line("decks", report.before.decks, report.after.decks);
  line("  succeeded", report.before.decksSucceeded, report.after.decksSucceeded);
  line("  failed", report.before.decksFailed, report.after.decksFailed);
  line("  failure rate", pct(report.before.deckFailureRate), pct(report.after.deckFailureRate));
  line("slides authored", report.before.slides, report.after.slides);
  line("local rewrites", report.before.localRepairs, report.after.localRepairs);
  line("gate rewrites", report.before.gateRepairs, report.after.gateRepairs);
  line("total rewrites", report.before.rewrites, report.after.rewrites);
  line(
    "rewrites / slide",
    num(report.before.rewritesPerSlide),
    num(report.after.rewritesPerSlide)
  );
  line(
    "first-try clean slides",
    pct(report.before.cleanSlideRate),
    pct(report.after.cleanSlideRate)
  );
  line("max gate round", report.before.maxGateRound, report.after.maxGateRound);
  line("hard slide failures", report.before.hardFailures, report.after.hardFailures);
  rule();

  if (report.straddlingDecks > 0) {
    lines.push(
      `Note: ${report.straddlingDecks} deck(s) started before the split and finished after it.`
    );
  }

  const unparsed =
    report.before.unparsedSlideDetails + report.after.unparsedSlideDetails;
  if (unparsed > 0) {
    lines.push(
      `Warning: ${unparsed} slide event(s) did not match the expected detail format ` +
        `and were excluded. The detail wording may have changed; update the parser.`
    );
  }

  const thin = ["before", "after"].filter(
    (era) => report[era].slides < MIN_SLIDES_FOR_CONFIDENCE
  );
  if (thin.length > 0) {
    lines.push(
      `Warning: ${thin.join(" and ")} cohort has fewer than ${MIN_SLIDES_FOR_CONFIDENCE} ` +
        `authored slides. Treat the comparison as directional only.`
    );
  }

  return lines.join("\n");
};

module.exports = {
  MIN_SLIDES_FOR_CONFIDENCE,
  buildRepairReport,
  formatRepairReport,
};
