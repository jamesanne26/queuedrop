import fs from "node:fs";
import path from "node:path";

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
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

export function loadPlaywrightEnvironment() {
  const loaded = [];

  // Shell/CI values win. Dedicated TEST env is loaded before normal app env.
  for (const file of [".env.test.local", ".env.local", ".env.test", ".env"]) {
    const absolute = path.resolve(file);
    if (!fs.existsSync(absolute)) continue;

    const values = parseEnv(fs.readFileSync(absolute, "utf8"));
    for (const [key, value] of Object.entries(values)) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loaded.push(file);
  }

  return loaded;
}

export function usableTestBaseUrl(value) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (/YOUR_TEST_DEPLOYMENT|your-test-url|test\.example\.com/i.test(candidate)) return null;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

// Local browser tests must use the same dedicated TEST project for both the
// Playwright fixtures and the Next.js server. Do not overwrite explicit app env.
export function configureLocalE2EAppEnvironment() {
  const pairs = [
    ["NEXT_PUBLIC_SUPABASE_URL", "QUEUEDROP_TEST_SUPABASE_URL"],
    ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "QUEUEDROP_TEST_SUPABASE_ANON_KEY"],
    ["SUPABASE_SERVICE_ROLE_KEY", "QUEUEDROP_TEST_SUPABASE_SERVICE_ROLE_KEY"],
  ];
  for (const [appName, testName] of pairs) {
    const testValue = process.env[testName]?.trim();
    const appValue = process.env[appName]?.trim();
    if (appValue && testValue && appValue !== testValue) {
      throw new Error(`E2E environment mismatch: ${appName} differs from ${testName}. Refusing to test against mixed databases.`);
    }
    if (!appValue && testValue) process.env[appName] = testValue;
  }
}
