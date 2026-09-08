import fs from "node:fs";

function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const result = {};
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const local = readEnvFile(".env.local");
const testLocal = readEnvFile(".env.test.local");
const secret = process.env.SMS_DISPATCH_SECRET || local.SMS_DISPATCH_SECRET || testLocal.SMS_DISPATCH_SECRET;
const baseUrl = process.env.QUEUEDROP_SMS_DISPATCH_URL || "http://localhost:3000";

if (!secret) {
  console.error("SMS_DISPATCH_SECRET is missing from the environment, .env.local, or .env.test.local.");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/internal/sms/dispatch`, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
});

let body;
try {
  body = await response.json();
} catch {
  body = { ok: false, error: await response.text() };
}

console.log(JSON.stringify(body, null, 2));
if (!response.ok) process.exit(1);
