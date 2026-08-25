/**
 * Repair-cost report for PPT Master deck generation.
 *
 * Reads the deck job event timeline from the database and prints repairs per
 * authored slide, split at a deploy boundary. The aggregation lives in
 * ./deckRepairStats.js; this file is only the command-line shell.
 *
 * Usage:
 *   node api/scripts/deck-repair-stats.cjs [--split <iso>] [--since <iso>] [--json]
 *
 *   --split  boundary between the two cohorts (default: the frame deploy)
 *   --since  ignore jobs started before this (default: no limit)
 *   --json   emit the raw report instead of the table
 */

const { Client } = require("pg");

const { buildRepairReport, formatRepairReport } = require("./deckRepairStats");

const FRAME_DEPLOYED_AT = "2026-08-25T07:20:00Z";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const readArg = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1];
};

const parseDate = (value, label) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(`Invalid --${label}: ${value}`);
    process.exit(1);
  }
  return date;
};

const splitAt = parseDate(readArg("split") || FRAME_DEPLOYED_AT, "split");
const since = parseDate(readArg("since"), "since");
const asJson = process.argv.includes("--json");

const run = async () => {
  const client = new Client({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  try {
    // The split is applied in JS, so the only optional SQL parameter is --since.
    const params = [];
    let sinceClause = "";
    if (since) {
      params.push(since.toISOString());
      sinceClause = `AND COALESCE(j.started_at, j.created_at) >= $${params.length}`;
    }

    const { rows } = await client.query(
      `SELECT
         j.id AS job_id,
         j.status AS job_status,
         COALESCE(j.started_at, j.created_at) AS started_at,
         j.completed_at,
         e.step,
         e.status AS event_status,
         e.slide_number,
         e.detail
       FROM deck_generation_jobs j
       LEFT JOIN deck_job_events e ON e.job_id = j.id
       WHERE j.status IN ('succeeded', 'failed')
         ${sinceClause}
       ORDER BY j.id, e.id`,
      params
    );

    const report = buildRepairReport(rows, { splitAt, since });

    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(`\n${formatRepairReport(report)}\n`);
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
