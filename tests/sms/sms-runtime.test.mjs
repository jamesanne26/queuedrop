import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidSmsRecipient,
  normalizeSmsRecipient,
  smsCountryFromRecipient,
} from "../../lib/notifications/phone.ts";
import {
  shouldForceSmsFailure,
  smsEnvFlag,
  smsRetryDelaySeconds,
} from "../../lib/notifications/sms-test-policy.ts";

test("SMS normalizes Philippine local mobile numbers", () => {
  assert.equal(normalizeSmsRecipient("0917 123 4567"), "639171234567");
  assert.equal(normalizeSmsRecipient("+63 917 123 4567"), "639171234567");
});

test("SMS validates normalized recipients", () => {
  assert.equal(isValidSmsRecipient("639171234567"), true);
  assert.equal(isValidSmsRecipient("09171234567"), false);
  assert.equal(isValidSmsRecipient("1234"), false);
});

test("SMS identifies PH routing country", () => {
  assert.equal(smsCountryFromRecipient("639171234567"), "PH");
});

test("SMS env flags accept supported true values", () => {
  for (const value of ["1", "true", "TRUE", "yes", "on"]) assert.equal(smsEnvFlag(value), true);
  for (const value of [undefined, "", "0", "false", "off"]) assert.equal(smsEnvFlag(value), false);
});

test("forced provider failure requires dry-run plus explicit failure-injection enablement", () => {
  assert.equal(shouldForceSmsFailure({
    SMS_DRY_RUN: "true",
    SMS_ENABLE_FAILURE_INJECTION: "true",
    SMS_FORCE_FAILURE: "true",
  }), true);
  assert.equal(shouldForceSmsFailure({ SMS_DRY_RUN: "true", SMS_FORCE_FAILURE: "true" }), false);
  assert.equal(shouldForceSmsFailure({
    SMS_DRY_RUN: "false",
    SMS_ENABLE_FAILURE_INJECTION: "true",
    SMS_FORCE_FAILURE: "true",
  }), false);
  assert.equal(shouldForceSmsFailure({ SMS_FORCE_FAILURE: "true" }), false);
});

test("SMS retry backoff is exponential and capped at 15 minutes", () => {
  assert.equal(smsRetryDelaySeconds(1), 30);
  assert.equal(smsRetryDelaySeconds(2), 60);
  assert.equal(smsRetryDelaySeconds(3), 120);
  assert.equal(smsRetryDelaySeconds(10), 900);
});
