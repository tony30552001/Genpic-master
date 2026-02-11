const { Pool } = require("pg");

const buildPool = () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL");
  }

  const useSsl = process.env.DATABASE_SSL === "true";
  return new Pool({
    connectionString,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
};

let pool;
const getPool = () => {
  if (!pool) {
    pool = buildPool();
  }
  return pool;
};

const query = (text, params) => getPool().query(text, params);

module.exports = { query, getPool };
