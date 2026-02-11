const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}

const migrationsDir = path.resolve(__dirname, "..", "..", "db", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const run = async () => {
  const client = new Client({
    connectionString,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      if (!sql.trim()) continue;
      console.log(`Running ${file}`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
