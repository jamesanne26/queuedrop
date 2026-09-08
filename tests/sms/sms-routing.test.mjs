import test from "node:test";
import assert from "node:assert/strict";
import { orderSmsMethodsForRule, validateRouteMethodSelection } from "../../lib/notifications/sms-routing.ts";

const semaphore = { id: "sem", name: "Semaphore", method_type: "cloud_provider", country_code: "PH", is_enabled: true, priority: 100, cost_per_sms: 1 };
const android = { id: "and", name: "Branch Android Gateway", method_type: "android_gateway", country_code: "PH", is_enabled: true, priority: 300, cost_per_sms: 0 };
const foreign = { id: "sg", name: "SG SMS", method_type: "cloud_provider", country_code: "SG", is_enabled: true, priority: 50, cost_per_sms: 1 };

test("route save validation requires an enabled same-country primary provider", () => {
  assert.equal(validateRouteMethodSelection({ countryCode: "PH", primaryMethodId: "sem", fallbackMethodIds: [], methods: [semaphore] }).primary.name, "Semaphore");
  assert.throws(() => validateRouteMethodSelection({ countryCode: "PH", primaryMethodId: "", fallbackMethodIds: [], methods: [semaphore] }), /Select an enabled delivery method/);
  assert.throws(() => validateRouteMethodSelection({ countryCode: "PH", primaryMethodId: "sg", fallbackMethodIds: [], methods: [semaphore, foreign] }), /Select an enabled delivery method/);
});

test("manual routing never silently falls back to an arbitrary Android gateway", () => {
  const methods = orderSmsMethodsForRule({ primary_method_id: null, fallback_method_ids: [], routing_policy: "manual_priority" }, [semaphore, android]);
  assert.deepEqual(methods, []);
});

test("manual route honors configured primary and fallback ordering", () => {
  const methods = orderSmsMethodsForRule({ primary_method_id: "sem", fallback_method_ids: ["and"], routing_policy: "manual_priority" }, [android, semaphore]);
  assert.deepEqual(methods.map((m) => m.id), ["sem", "and"]);
});

test("cloud-only route excludes Android gateways", () => {
  const methods = orderSmsMethodsForRule({ primary_method_id: "and", fallback_method_ids: [], routing_policy: "cloud_only" }, [android, semaphore]);
  assert.deepEqual(methods.map((m) => m.id), ["sem"]);
});
