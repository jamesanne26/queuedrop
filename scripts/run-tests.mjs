import { access, readFile, readdir } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const suite = process.argv[2] ?? "unit";
const coverage = process.argv.includes("--coverage");
const watch = process.argv.includes("--watch");
const required = process.argv.includes("--required");
const root = path.resolve("tests", suite);

function parseEnv(text) {
  const parsed = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const equals = normalized.indexOf("=");
    if (equals <= 0) continue;

    const key = normalized.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = normalized.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      const comment = value.search(/\s+#/);
      if (comment >= 0) value = value.slice(0, comment).trimEnd();
    }
    parsed[key] = value.replace(/\\n/g, "\n");
  }
  return parsed;
}

async function loadEnvFile(file, { override = false } = {}) {
  const absolute = path.resolve(file);
  try {
    await access(absolute, fsConstants.R_OK);
  } catch {
    return false;
  }

  const values = parseEnv(await readFile(absolute, "utf8"));
  for (const [key, value] of Object.entries(values)) {
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
  return true;
}

async function loadTestEnvironment() {
  // Existing shell/CI variables always win. Dedicated TEST env values win over
  // normal local app values. Nothing here is ever written back to disk.
  const loaded = [];
  for (const file of [".env.test.local", ".env.local", ".env.test", ".env"]) {
    if (await loadEnvFile(file)) loaded.push(file);
  }
  return loaded;
}

if (suite !== "unit") {
  const loaded = await loadTestEnvironment();
  if (loaded.length) console.log(`[QueueDrop tests] Loaded environment: ${loaded.join(", ")}`);
  else console.log("[QueueDrop tests] No local env file found; using process environment only.");
}

if (required) {
  if (suite === "integration") process.env.QUEUEDROP_REQUIRE_INTEGRATION = "1";
  if (suite === "e2e/smoke") process.env.QUEUEDROP_REQUIRE_SMOKE = "1";
}

async function collect(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return collect(absolute);
    return /\.test\.(?:ts|mjs|js)$/.test(entry.name) ? [absolute] : [];
  }));
  return nested.flat();
}

const files = await collect(root).catch(() => []);
if (!files.length) {
  console.error(`No tests found under ${root}`);
  process.exit(1);
}

const args = ["--no-warnings", "--experimental-strip-types"];
if (coverage) args.push("--experimental-test-coverage");
args.push("--test");
if (watch) args.push("--watch");
args.push(...files);

const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
child.on("exit", (code) => process.exit(code ?? 1));
