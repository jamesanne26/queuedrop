import test from "node:test";
import assert from "node:assert/strict";
import { smsEnvFlag, shouldForceSmsFailure, smsRetryDelaySeconds } from "../../lib/notifications/sms-test-policy.ts";

test("SMS env flags accept common truthy forms", () => {
  for (const value of ["1", "true", "TRUE", " yes ", "on"]) assert.equal(smsEnvFlag(value), true);
  for (const value of [undefined, "", "0", "false", "off", "no"]) assert.equal(smsEnvFlag(value), false);
});

test("failure injection requires all three safety flags", () => {
  assert.equal(shouldForceSmsFailure({ SMS_DRY_RUN:"1", SMS_ENABLE_FAILURE_INJECTION:"1", SMS_FORCE_FAILURE:"1" }), true);
  assert.equal(shouldForceSmsFailure({ SMS_DRY_RUN:"0", SMS_ENABLE_FAILURE_INJECTION:"1", SMS_FORCE_FAILURE:"1" }), false);
  assert.equal(shouldForceSmsFailure({ SMS_DRY_RUN:"1", SMS_ENABLE_FAILURE_INJECTION:"0", SMS_FORCE_FAILURE:"1" }), false);
});

test("SMS retry backoff starts at 30 seconds and caps at 15 minutes", () => {
  assert.equal(smsRetryDelaySeconds(1), 30);
  assert.equal(smsRetryDelaySeconds(2), 60);
  assert.equal(smsRetryDelaySeconds(6), 900);
  assert.equal(smsRetryDelaySeconds(99), 900);
});
