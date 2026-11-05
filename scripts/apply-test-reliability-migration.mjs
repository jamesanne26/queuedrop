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
const sql = ["20261006055057_queue_reliability.sql", "20261006070929_printer_claim_fencing.sql",
  "20261007144253_tenant_boundary_hardening.sql", "20261007145134_browser_ticket_database_rate_limit.sql",
  "20261007150233_restrict_test_cleanup_rpc.sql",
  "20261007150525_enforce_queue_mutation_entrypoints.sql",
  "20261010193000_restore_clean_rebuild_permission_catalog.sql",
].map(name => readFileSync(`supabase/migrations/${name}`, "utf8")).join("\n");
// Keep credentials out of command-line arguments and error output.
const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction"], {
  env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432",
    PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: database.pathname.slice(1) || "postgres", PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" },
  input: sql, encoding: "utf8", timeout: 90_000,
});
if (result.status !== 0) {
  // Never print raw psql output: PostgreSQL errors can echo SQL, connection details or secrets.
  const diagnostic = [result.error?.message, result.stderr, result.stdout].filter(Boolean).join("\n");
  const category =
    result.error?.code === "ETIMEDOUT" ? "psql process timed out" :
    result.error?.code === "ENOENT" ? "psql executable missing" :
    /password authentication failed|no password supplied/i.test(diagnostic) ? "database authentication rejected" :
    /could not translate host name|name or service not known|temporary failure in name resolution/i.test(diagnostic) ? "database hostname/DNS resolution failed" :
    /connection timed out|timeout expired|network is unreachable|no route to host/i.test(diagnostic) ? "database network connection timed out or unreachable" :
    /too many connections|remaining connection slots/i.test(diagnostic) ? "database connection limit reached" :
    /permission denied|must be owner|insufficient privilege/i.test(diagnostic) ? "database permissions insufficient for migration" :
    /already exists|duplicate object|duplicate key/i.test(diagnostic) ? "migration conflicts with existing database objects" :
    /does not exist|undefined (table|column|function)|relation .* does not exist/i.test(diagnostic) ? "migration references missing database objects" :
    /syntax error|invalid input syntax/i.test(diagnostic) ? "SQL syntax or input error" :
    "unclassified database or migration failure";
  console.error(`TEST migration failed; transaction rolled back. Category: ${category}; psql exit: ${result.status ?? "not started"}; signal: ${result.signal ?? "none"}.`);
  process.exit(1);
}
console.log("TEST reliability, tenant security, and clean-rebuild role catalog migrations committed successfully.");
const isolation = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1"], {
  env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port || "5432",
    PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password),
    PGDATABASE: database.pathname.slice(1) || "postgres", PGSSLMODE: "require", PGCONNECT_TIMEOUT: "15" },
  input: readFileSync("tests/integration/tenant-boundary.sql", "utf8"), encoding: "utf8", timeout: 90_000,
});
if (isolation.status !== 0) {
  console.error("TEST tenant isolation regression failed. Synthetic fixture transaction rolled back.");
  process.exit(1);
}
console.log("Authenticated/anonymous tenant isolation regression passed; synthetic fixtures rolled back.");
