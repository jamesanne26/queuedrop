import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

if (process.env.GITHUB_REF_NAME !== "test") throw new Error("Database migration is restricted to branch test.");
const connection = process.env.QUEUEDROP_TEST_DATABASE_URL?.trim();
if (!connection) {
  console.log("No TEST database connection configured. Checking whether migration was applied manually.");
  process.exit(0);
}
const database = new URL(connection);
const project = new URL(process.env.QUEUEDROP_TEST_SUPABASE_URL).hostname.split(".")[0];
if (!["postgres:","postgresql:"].includes(database.protocol) ||
    !(database.hostname === `db.${project}.supabase.co` ||
      (database.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(database.username) === `postgres.${project}`))) {
  throw new Error("Database URL does not match the dedicated TEST Supabase project. Migration refused.");
}
const sql = readFileSync("supabase/migrations/20261006050000_queue_reliability.sql", "utf8");
// Keep credentials out of command-line arguments and error output.
const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction"], {
  env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432",
    PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: database.pathname.slice(1) || "postgres", PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" },
  input: sql, encoding: "utf8", timeout: 90_000,
});
if (result.status !== 0) {
  console.error("TEST migration failed; transaction rolled back. Check database access and migration compatibility.");
  process.exit(1);
}
console.log("TEST reliability migration committed successfully.");
