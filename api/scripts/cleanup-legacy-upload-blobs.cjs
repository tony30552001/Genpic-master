/**
 * One-off sweep for blobs left behind by the retired `/api/blob-sas` endpoint.
 *
 * The uploads container still holds flat blobs written before commit 55977e9
 * retired arbitrary SAS signing. They have no database row and no code path
 * that reads or deletes them. This script removes exactly those, keeping every
 * blob under the managed `staging/` and `ready/` prefixes and every blob whose
 * name still appears in a stored database value.
 *
 * The script is read-only unless `--apply` is passed. Blob soft-delete on the
 * storage account governs how long a removed blob stays recoverable.
 *
 * Usage:
 *   node api/scripts/cleanup-legacy-upload-blobs.cjs [--apply] [--manifest <path>]
 *
 *   --apply     delete the orphaned blobs instead of only reporting them
 *   --manifest  write the full classification to a JSON file
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const {
  getUploadContainerClient,
  getUploadContainerName,
} = require("../_shared/uploadStorage");
const {
  classifyUploadBlobs,
  formatClassification,
  formatMegabytes,
  sumBytes,
} = require("./legacyUploadBlobs");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const manifestIndex = process.argv.indexOf("--manifest");
const manifestPath = manifestIndex === -1 ? null : process.argv[manifestIndex + 1];

if (manifestIndex !== -1 && !manifestPath) {
  console.error("Missing value for --manifest");
  process.exit(1);
}

/**
 * Collect every stored text value that mentions the uploads container.
 *
 * The columns are discovered from the catalog rather than hardcoded so that a
 * new table referencing an upload URL cannot silently lose its blob.
 */
const readReferenceTexts = async (client, containerName) => {
  const { rows: columns } = await client.query(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND c.data_type IN ('text', 'character varying')
      ORDER BY c.table_name, c.column_name`
  );

  const needle = `%/${containerName}/%`;
  const texts = [];
  const sources = [];

  for (const { table_name: table, column_name: column } of columns) {
    // Identifiers come from the catalog, so quoting them is safe here.
    const { rows } = await client.query(
      `SELECT "${column}" AS value FROM "${table}" WHERE "${column}" LIKE $1`,
      [needle]
    );
    if (rows.length === 0) continue;
    sources.push({ table, column, rows: rows.length });
    for (const row of rows) texts.push(String(row.value));
  }

  return { texts, sources };
};

const listBlobs = async (containerClient) => {
  const blobs = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    blobs.push({ name: blob.name, contentLength: blob.properties.contentLength });
  }
  return blobs;
};

const run = async () => {
  const containerName = getUploadContainerName();
  const { containerClient } = getUploadContainerClient();
  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  let classification;
  let sources;
  try {
    const references = await readReferenceTexts(client, containerName);
    sources = references.sources;
    const blobs = await listBlobs(containerClient);
    classification = classifyUploadBlobs(blobs, references.texts, containerName);
  } finally {
    await client.end();
  }

  console.log(`\ncontainer: ${containerName}`);
  console.log("\ndatabase columns referencing the container:");
  if (sources.length === 0) {
    console.log("  (none)");
  } else {
    for (const source of sources) {
      console.log(`  ${source.table}.${source.column}  ${source.rows} rows`);
    }
  }

  console.log(`\n${formatClassification(classification)}\n`);

  if (manifestPath) {
    const target = path.resolve(manifestPath);
    fs.writeFileSync(target, `${JSON.stringify({ sources, ...classification }, null, 2)}\n`);
    console.log(`manifest written to ${target}\n`);
  }

  const { orphaned } = classification;
  if (orphaned.length === 0) {
    console.log("Nothing to remove.\n");
    return;
  }

  if (!apply) {
    console.log(`Dry run. Re-run with --apply to delete ${orphaned.length} blobs.\n`);
    return;
  }

  let deleted = 0;
  let deletedBytes = 0;
  const failures = [];

  for (const entry of orphaned) {
    try {
      await containerClient.deleteBlob(entry.name, { deleteSnapshots: "include" });
      deleted += 1;
      deletedBytes += entry.bytes;
    } catch (error) {
      failures.push({ name: entry.name, message: error.message });
    }
  }

  console.log(`Deleted ${deleted} blobs, reclaimed ${formatMegabytes(deletedBytes)}.`);

  if (failures.length > 0) {
    console.error(`\n${failures.length} deletions failed:`);
    for (const failure of failures) console.error(`  ${failure.name}: ${failure.message}`);
    process.exitCode = 1;
    return;
  }

  const remaining = sumBytes(orphaned) - deletedBytes;
  if (remaining !== 0) console.log(`Unreclaimed: ${formatMegabytes(remaining)}`);
  console.log("");
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
