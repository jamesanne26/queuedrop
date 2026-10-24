import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

function seal(bytes, password) {
  const salt = randomBytes(32), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 600000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const header = { version: 1, cipher: "aes-256-gcm", kdf: "pbkdf2-sha256", iterations: 600000,
    salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  key.fill(0);
  return Buffer.concat([Buffer.from(JSON.stringify(header) + "\n"), encrypted]);
}
function unseal(bytes, password) {
  const split = bytes.indexOf(10);
  assert.ok(split > 0 && split < 2048, "invalid encrypted backup header");
  const h = JSON.parse(bytes.subarray(0, split).toString());
  assert.equal(h.version, 1);
  assert.equal(h.iterations, 600000);
  assert.equal(h.cipher, "aes-256-gcm");
  assert.equal(h.kdf, "pbkdf2-sha256");
  const key = pbkdf2Sync(password, Buffer.from(h.salt, "base64"), h.iterations, 32, "sha256");
  const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(h.iv, "base64"));
  cipher.setAuthTag(Buffer.from(h.tag, "base64"));
  try { return Buffer.concat([cipher.update(bytes.subarray(split + 1)), cipher.final()]); }
  finally { key.fill(0); }
}
if (process.argv.includes("--self-test")) {
  const plain = Buffer.from("disposable encryption verification"), password = randomBytes(32).toString("hex");
  const encrypted = seal(plain, password);
  assert.deepEqual(unseal(encrypted, password), plain);
  assert.throws(() => unseal(encrypted, "wrong password"));
  const changed = Buffer.from(encrypted); changed[changed.length - 1] ^= 1;
  assert.throws(() => unseal(changed, password));
  console.log("PASS: encrypted backup round-trip, wrong password and tamper rejection");
} else {
  await rehearse();
}

async function rehearse() {
  const password = process.env.QUEUEDROP_PROD_DB_PASSWORD;
  assert.ok(password, "Missing QUEUEDROP_PROD_DB_PASSWORD repository secret");
  const root = mkdtempSync(join(tmpdir(), "queuedrop-prod-backup-"));
  const source = join(root, "source"), recovered = join(root, "recovered");
  mkdirSync(source, { mode: 0o700 }); mkdirSync(recovered, { mode: 0o700 });
  const artifactDir = resolve("encrypted-production-backup");
  mkdirSync(artifactDir, { recursive: true, mode: 0o700 });
  const container = "queuedrop-prod-restore-" + process.pid;
  const remoteEnv = {
    ...process.env, PGPASSWORD: password,
    PGHOST: "aws-0-ap-northeast-2.pooler.supabase.com", PGPORT: "5432",
    PGUSER: "postgres.sylvegfbkxgjfctbjfec", PGDATABASE: "postgres", PGSSLMODE: "require",
    PGCONNECT_TIMEOUT: "15", PGOPTIONS: "-c default_transaction_read_only=on -c statement_timeout=180000",
  };
  const remoteArgs = ["run", "--rm", "-i",
    ...["PGPASSWORD", "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGOPTIONS"].flatMap(k => ["-e", k]),
    "postgres:17"];
  const schemas = ["public", "support_private", "auth", "storage", "supabase_migrations"];
  let keeper, stage = "preflight";
  const ident = x => '"' + x.replaceAll('"', '""') + '"';
  const literal = x => "'" + x.replaceAll("'", "''") + "'";
  function run(args, { remote = false, input, file } = {}) {
    let fd;
    if (file) fd = openSync(file, "w", 0o600);
    const r = spawnSync("docker", args, { encoding: file ? undefined : "utf8",
      env: remote ? remoteEnv : process.env, input, maxBuffer: 128 * 1024 * 1024,
      timeout: 240000, stdio: file ? ["pipe", fd, "pipe"] : "pipe" });
    if (fd !== undefined) closeSync(fd);
    if (r.status !== 0) {
      const stderr = String(r.stderr ?? "");
      // Exclude COPY context / row values and never emit complete database stderr.
      const safe = (stderr.match(/(?:FATAL|ERROR):[^\r\n]*/)?.[0] ?? "command failed")
        .replaceAll(password, "[REDACTED]").replace(/[\w.+-]+@[\w.-]+/g, "[REDACTED]");
      throw new Error(stage + ": " + safe);
    }
    return String(r.stdout ?? "").trim();
  }
  function sourceSql(sql) {
    return run([...remoteArgs, "psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql], { remote: true });
  }
  function localSql(sql) {
    return run(["exec", "-i", container, "psql", "-U", "postgres", "-d", "rehearsal", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"], { input: sql });
  }
  try {
    console.log("Checking read-only Production connection");
    run(["pull", "postgres:17"]);
    assert.equal(sourceSql("SHOW transaction_read_only"), "on", "Production connection must be read-only");
    const version = Number(sourceSql("SHOW server_version_num"));
    assert.ok(version >= 170000 && version < 180000, "backup client expects PostgreSQL 17");
    stage = "consistent snapshot";
    keeper = spawn("docker", [...remoteArgs, "psql", "-X", "-Atq", "-v", "ON_ERROR_STOP=1"],
      { env: remoteEnv, stdio: ["pipe", "pipe", "pipe"] });
    let keeperOutput = "";
    keeper.stdout.on("data", d => { keeperOutput += d; });
    keeper.stderr.on("data", () => {});
    keeper.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n");
    for (let n = 0; n < 150 && !keeperOutput.includes("\n"); n++) await delay(100);
    const snapshot = keeperOutput.trim().split("\n")[0];
    assert.match(snapshot, /^[0-9A-F]+-[0-9A-F]+-[0-9]+$/i, "could not export Production snapshot");
    const inSnapshot = sql => sourceSql("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT " + literal(snapshot) + "; " + sql + "; COMMIT;");
    const roleNames = JSON.parse(inSnapshot("SELECT coalesce(json_agg(rolname ORDER BY rolname),'[]') FROM pg_roles WHERE rolname !~ '^pg_' AND rolname<>'postgres'"));
    const tables = JSON.parse(inSnapshot("SELECT coalesce(json_agg(json_build_object('schema',schemaname,'name',tablename) ORDER BY schemaname,tablename),'[]') FROM pg_tables WHERE schemaname IN (" + schemas.map(literal).join(",") + ")"));
    assert.ok(tables.length > 0, "no backup tables found");
    const fingerprintSql = tables.map(t => {
      const label = t.schema + "." + t.name, name = ident(t.schema) + "." + ident(t.name);
      return "SELECT " + literal(label) + "||'|'||count(*)::text||'|'||coalesce(md5(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text)),md5('')) FROM " + name + " t";
    }).join(" UNION ALL ") + " ORDER BY 1";
    const fingerprints = inSnapshot(fingerprintSql);
    const metadata = { project: "sylvegfbkxgjfctbjfec", created_at: new Date().toISOString(),
      schemas, roleNames, tables, fingerprints, fingerprintSql,
      exclusions: "Storage object bytes, platform configuration, Vault encryption keys, Edge Function code and provider secrets are not in this logical database archive." };
    writeFileSync(join(source, "manifest.json"), JSON.stringify(metadata), { mode: 0o600 });
    // Archive scheduler configuration separately; never enable jobs on the isolated restore.
    writeFileSync(join(source, "scheduler.json"), inSnapshot("SELECT coalesce(json_agg(j),'[]') FROM cron.job j"), { mode: 0o600 });
    stage = "Production export";
    run([...remoteArgs, "pg_dump", "-Fc", "--snapshot=" + snapshot, "--lock-wait-timeout=10000",
      ...schemas.map(s => "--schema=" + s)], { remote: true, file: join(source, "database.dump") });
    keeper.stdin.end("ROLLBACK;\n");
    console.log("PASS: Production logical export completed using a consistent read-only snapshot");
    stage = "backup encryption";
    const archive = join(root, "backup.tar");
    const tar = spawnSync("tar", ["-cf", archive, "-C", source, "."], { encoding: "utf8" });
    assert.equal(tar.status, 0, "backup packaging failed");
    const plain = readFileSync(archive);
    assert.ok(plain.length < 128 * 1024 * 1024, "backup exceeds bounded rehearsal size");
    const encrypted = seal(plain, password);
    const encryptedPath = join(artifactDir, "production-backup.qdbak");
    writeFileSync(encryptedPath, encrypted, { mode: 0o600 });
    rmSync(source, { recursive: true, force: true }); rmSync(archive);
    // Restore exclusively from the authenticated encrypted artifact, not original files.
    writeFileSync(archive, unseal(readFileSync(encryptedPath), password), { mode: 0o600 });
    plain.fill(0);
    assert.equal(spawnSync("tar", ["-xf", archive, "-C", recovered]).status, 0, "decrypted archive extraction failed");
    const manifest = JSON.parse(readFileSync(join(recovered, "manifest.json")));
    console.log("PASS: encrypted backup decrypted successfully for restore verification");
    stage = "isolated restore startup";
    run(["run", "-d", "--network", "none", "--name", container, "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17"]);
    let ready = false;
    for (let n = 0; n < 60; n++) {
      const r = spawnSync("docker", ["exec", container, "pg_isready", "-U", "postgres"], { stdio: "ignore" });
      if (r.status === 0) { ready = true; break; } await delay(1000);
    }
    assert.ok(ready, "isolated PostgreSQL did not start");
    run(["exec", container, "createdb", "-U", "postgres", "rehearsal"]);
    localSql("DROP SCHEMA public; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; CREATE EXTENSION \"uuid-ossp\" WITH SCHEMA extensions;");
    localSql(manifest.roleNames.map(role => "CREATE ROLE " + ident(role) + " NOLOGIN;").join("\n"));
    stage = "restoring Production database archive";
    run(["cp", join(recovered, "database.dump"), container + ":/tmp/database.dump"]);
    run(["exec", container, "pg_restore", "-U", "postgres", "-d", "rehearsal", "--no-owner", "--exit-on-error", "/tmp/database.dump"]);
    assert.equal(localSql(manifest.fingerprintSql), manifest.fingerprints, "restored Production table fingerprints differ");
    console.log("PASS: restored Production records match across " + manifest.tables.length + " tables");
    stage = "migration rehearsal on Production restore";
    const generation = spawnSync(process.execPath, ["scripts/build-production-delta.mjs"], { encoding: "utf8" });
    assert.equal(generation.status, 0, "delta generation failed");
    localSql(generation.stdout);
    const audit = localSql(readFileSync("supabase/tests/read_only_release_audit.sql", "utf8"));
    assert.equal(audit.split("\n").filter(l => l.includes("|PASS|")).length, 6, "restored Production delta did not pass six release checks");
    assert.ok(!audit.includes("|FAIL|"), "restored Production release audit failed");
    assert.equal(localSql(manifest.fingerprintSql), manifest.fingerprints, "migration changed Production business records");
    console.log("PASS: six release checks after migration on restored Production; all backed-up rows unchanged");
    writeFileSync(join(artifactDir, "verification.txt"),
      "Production logical backup export, authenticated encryption, isolated restore and migration rehearsal PASSED.\nNo Production writes were performed.\nArchive includes database schemas listed in the manifest; Storage files and platform secrets/configuration need separate recovery coverage.\n");
  } finally {
    if (keeper && keeper.exitCode === null) { keeper.stdin.end(); keeper.kill("SIGTERM"); }
    spawnSync("docker", ["rm", "-f", container], { stdio: "ignore", timeout: 15000 });
    rmSync(root, { recursive: true, force: true });
  }
}
