import assert from "node:assert/strict";
import { createCipheriv, publicEncrypt, randomBytes, constants } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const endpoint = "https://queuedrop-test.vercel.app/api/payments/paymongo/webhook";
const requiredEvents = ["checkout_session.payment.paid", "payment.paid", "subscription.invoice.paid", "subscription.updated", "subscription.past_due", "subscription.unpaid"];
const key = process.env.QUEUEDROP_PAYMONGO_TEST_SECRET_KEY;
const pub = readFileSync("ops/paymongo-test-transport-public.pem", "utf8");
if (process.argv.includes("--self-test")) {
  const wrapped = publicEncrypt({ key: pub, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, randomBytes(32));
  assert.equal(wrapped.length, 512);
  console.log("PASS: sandbox setup syntax and public-key encryption configuration");
} else {
  assert.ok(key?.startsWith("sk_test_"), "A PayMongo sk_test_ key is required; live keys are refused");
  assert.ok(key === key.trim(), "Remove whitespace from the TEST secret");
  async function api(path, method = "GET", body) {
    const response = await fetch("https://api.paymongo.com/v1" + path, {
      method, headers: { Authorization: "Basic " + Buffer.from(key + ":").toString("base64"), Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error("PayMongo sandbox HTTP " + response.status + " (" +
      (payload.errors ?? []).map(e => String(e.code ?? "unknown")).join(",") + ")");
    return payload;
  }
  const listed = await api("/webhooks?limit=100&url=" + encodeURIComponent(endpoint));
  const matches = (listed.data ?? []).filter(h => h.attributes?.url === endpoint);
  assert.ok(matches.length <= 1, "Multiple matching TEST hooks; refusing ambiguous configuration");
  let hook = matches[0];
  if (!hook) {
    hook = (await api("/webhooks", "POST", { data: { attributes: { url: endpoint, events: requiredEvents } } })).data;
    console.log("Created sandbox webhook for the TEST endpoint");
  } else {
    assert.equal(hook.attributes.livemode, false, "Refusing a live webhook");
    const events = [...new Set([...(hook.attributes.events ?? []), ...requiredEvents])];
    if (requiredEvents.some(e => !hook.attributes.events?.includes(e))) {
      hook = (await api("/webhooks/" + encodeURIComponent(hook.id), "PUT", { data: { attributes: { url: endpoint, events } } })).data;
    }
  }
  assert.equal(hook.attributes.livemode, false, "Expected sandbox webhook");
  if (hook.attributes.status !== "enabled") hook = (await api("/webhooks/" + encodeURIComponent(hook.id) + "/enable", "POST")).data;
  hook = (await api("/webhooks/" + encodeURIComponent(hook.id))).data;
  assert.equal(hook.attributes.url, endpoint);
  assert.equal(hook.attributes.status, "enabled");
  assert.equal(hook.attributes.livemode, false);
  assert.ok(hook.attributes.secret_key, "Provider did not return the webhook signing secret");
  const summary = { id: hook.id, endpoint, livemode: false, status: hook.attributes.status, events: hook.attributes.events };
  const secretPayload = Buffer.from(JSON.stringify({ testSecretKey: key, webhookSecret: hook.attributes.secret_key, ...summary }));
  const dataKey = randomBytes(32), iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", dataKey, iv);
  const ciphertext = Buffer.concat([cipher.update(secretPayload), cipher.final()]);
  const wrapped = publicEncrypt({ key: pub, oaepHash: "sha256", padding: constants.RSA_PKCS1_OAEP_PADDING }, dataKey);
  mkdirSync("paymongo-test-setup", { recursive: true, mode: 0o700 });
  writeFileSync("paymongo-test-setup/secure-config.json", JSON.stringify({ version: 1,
    wrappedKey: wrapped.toString("base64"), iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") }), { mode: 0o600 });
  writeFileSync("paymongo-test-setup/summary.json", JSON.stringify(summary, null, 2));
  dataKey.fill(0); secretPayload.fill(0);
  console.log("PASS: sandbox key accepted and TEST webhook is enabled");
  console.log(JSON.stringify(summary));
}
