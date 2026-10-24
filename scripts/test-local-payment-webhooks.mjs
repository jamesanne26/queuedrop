import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";

// Discover only this checkout's disposable local Supabase. Never accept a URL
// or key from remote project env vars and never contact the PayMongo API.
const status = spawnSync("npx", ["--yes", "supabase@2.120.0", "status", "-o", "json"], { encoding: "utf8" });
assert.equal(status.status, 0, "local Supabase status failed");
const local = JSON.parse(status.stdout);
const localUrl = new URL(local.API_URL);
assert.equal(localUrl.protocol, "http:");
assert.ok(["127.0.0.1", "localhost"].includes(localUrl.hostname), "refusing non-local database");
assert.ok(local.SERVICE_ROLE_KEY && local.ANON_KEY, "local JWT credentials missing");
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const secret = randomBytes(32).toString("hex");
const suffix = randomUUID();
const base = "http://127.0.0.1:3100";
let output = "";
let plan;
const businesses = [];
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3100"], {
  detached: true,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_APP_ENV: "test",
    NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: local.SERVICE_ROLE_KEY,
    PAYMONGO_WEBHOOK_SECRET: secret,
    PAYMONGO_SECRET_KEY: "sk_test_disposable_no_provider_calls",
    SMS_DRY_RUN: "true",
    SMS_DELIVERY_PAUSED: "true",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", d => { output = (output + d).slice(-16000); });
child.stderr.on("data", d => { output = (output + d).slice(-16000); });
const exited = new Promise(resolve => child.once("exit", resolve));
let failures = false;
async function db(query) {
  const result = await query;
  assert.equal(result.error, null, result.error?.message);
  return result.data;
}
function sign(raw, timestamp = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},te=${sig},li=`;
}
async function post(event, expected, { stale = false, unsigned = false, tamper = false } = {}) {
  const raw = typeof event === "string" ? event : JSON.stringify(event);
  const signature = sign(raw, Math.floor(Date.now() / 1000) - (stale ? 301 : 0));
  const response = await fetch(base + "/api/payments/paymongo/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(unsigned ? {} : { "paymongo-signature": signature }) },
    body: tamper ? raw + " " : raw,
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
function event(type, id, attributes) {
  return { data: { id: "evt_" + randomUUID(), attributes: { type, livemode: false, data: { id, attributes } } } };
}
function checkout(orderId, paymentId, amount = 49900, currency = "PHP") {
  return event("checkout_session.payment.paid", "cs_" + suffix, {
    reference_number: orderId,
    payments: [{ id: paymentId, attributes: { status: "paid", amount, currency, paid_at: Math.floor(Date.now() / 1000) } }],
  });
}
async function fixture(name, mode, subscriptionId) {
  const business = await db(admin.from("businesses").insert({ name, slug: name.toLowerCase().replaceAll(" ", "-") + "-" + suffix }).select("id").single());
  businesses.push(business.id);
  const order = await db(admin.from("subscription_orders").insert({
    business_id: business.id, plan_id: plan.id, amount: 499, subtotal: 499, currency: "PHP",
    provider: "paymongo", payment_mode: mode, status: mode === "subscription" ? "pending" : "checkout_created",
    billing_interval: "monthly", renewal_mode: mode === "subscription" ? "auto" : "manual",
    ...(subscriptionId ? { provider_subscription_id: subscriptionId } : {}),
  }).select("id").single());
  return { businessId: business.id, orderId: order.id };
}
async function state(businessId) {
  const payments = await db(admin.from("payments").select("id,subscription_order_id,provider_payment_id,amount,currency").eq("business_id", businessId).order("id"));
  const subscription = await db(admin.from("business_subscriptions").select("status,expires_at").eq("business_id", businessId).maybeSingle());
  const orders = await db(admin.from("subscription_orders").select("id,status").eq("business_id", businessId).order("id"));
  return { payments, subscription, orders };
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(child.exitCode, null, "Next server exited during startup");
    try {
      const response = await fetch(base + "/api/health", { signal: AbortSignal.timeout(2000) });
      if (response.ok) { ready = true; break; }
    } catch { /* bounded startup polling */ }
    await delay(1000);
  }
  assert.ok(ready, "local Next server did not become ready");
  plan = await db(admin.from("plans").insert({ name: "Webhook HTTP QA " + suffix, price_monthly: 499 }).select("id").single());
  const manual = await fixture("Webhook Checkout", "online");
  const pending = await state(manual.businessId);
  const paid = checkout(manual.orderId, "pay_http_" + suffix);
  await post(paid, 401, { unsigned: true });
  await post(paid, 401, { stale: true });
  await post(paid, 401, { tamper: true });
  await post("{invalid-json", 400);
  await post(event("checkout_session.payment.paid", "cs_missing", {}), 422);
  await post(checkout(randomUUID(), "pay_missing_" + suffix), 404);
  await post(checkout(manual.orderId, "pay_wrong_" + suffix, 49899), 409);
  await post(checkout(manual.orderId, "pay_wrong_" + suffix, 49900, "USD"), 409);
  assert.deepEqual(await state(manual.businessId), pending, "rejected deliveries changed billing state");
  console.log("PASS: unsigned, stale, tampered, malformed, missing-order and wrong-amount/currency requests leave billing unchanged");
  const first = await post(paid, 200);
  assert.equal(first.result.duplicate, false);
  const fulfilled = await state(manual.businessId);
  assert.equal(fulfilled.payments.length, 1);
  assert.equal(fulfilled.subscription.status, "active");
  assert.equal(fulfilled.orders[0].status, "paid");
  const duplicate = await post(paid, 200);
  assert.equal(duplicate.result.duplicate, true);
  assert.deepEqual(await state(manual.businessId), fulfilled, "checkout retry extended access or duplicated payment");
  console.log("PASS: signed HTTP checkout activates once and retry preserves payment count and expiry");

  const sid = "sub_http_" + suffix;
  const recurring = await fixture("Webhook Invoice", "subscription", sid);
  const invoice = (id, months) => event("subscription.invoice.paid", id, {
    subscription: { id: sid }, amount: 49900, currency: "PHP",
    next_billing_schedule: new Date(Date.now() + months * 31 * 86400000).toISOString(),
  });
  const activation = invoice("in_http_initial_" + suffix, 2);
  assert.equal((await post(activation, 200)).result.duplicate, false);
  const activated = await state(recurring.businessId);
  assert.equal(activated.payments.length, 1);
  assert.equal(activated.subscription.status, "active");
  assert.equal(activated.orders[0].status, "paid");
  assert.equal((await post(activation, 200)).result.duplicate, true);
  assert.deepEqual(await state(recurring.businessId), activated);
  const renewal = invoice("in_http_renewal_" + suffix, 3);
  assert.equal((await post(renewal, 200)).result.duplicate, false);
  const renewed = await state(recurring.businessId);
  assert.equal(renewed.payments.length, 2);
  assert.ok(new Date(renewed.subscription.expires_at) > new Date(activated.subscription.expires_at));
  assert.equal((await post(renewal, 200)).result.duplicate, true);
  assert.deepEqual(await state(recurring.businessId), renewed);
  console.log("PASS: signed HTTP invoice activation and renewal each apply once; duplicate delivery preserves expiry");
} catch (error) {
  failures = true;
  console.error(error.message);
  let safeOutput = output;
  for (const value of [secret, local.SERVICE_ROLE_KEY, local.ANON_KEY]) safeOutput = safeOutput.replaceAll(value, "[REDACTED]");
  console.error(safeOutput);
} finally {
  for (const businessId of businesses) {
    for (const table of ["payments", "business_subscriptions", "subscription_orders", "businesses"]) {
      const result = await admin.from(table).delete().eq(table === "businesses" ? "id" : "business_id", businessId);
      if (result.error) { failures = true; console.error("Fixture cleanup failed for " + table); }
    }
  }
  if (plan) {
    const result = await admin.from("plans").delete().eq("id", plan.id);
    if (result.error) { failures = true; console.error("Plan cleanup failed"); }
  }
  try { process.kill(-child.pid, "SIGTERM"); } catch { /* server already exited */ }
  await Promise.race([exited, delay(5000)]);
  try { process.kill(-child.pid, "SIGKILL"); } catch { /* server stopped */ }
}
if (failures) process.exitCode = 1;
