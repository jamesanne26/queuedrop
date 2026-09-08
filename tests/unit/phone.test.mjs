import test from "node:test";
import assert from "node:assert/strict";
import {
  isValidSmsRecipient,
  maskSmsRecipient,
  normalizeSmsRecipient,
  smsCountryFromRecipient,
  splitSmsRecipient,
} from "../../lib/notifications/phone.ts";

test("normalizes PH 09 mobile format", () => assert.equal(normalizeSmsRecipient("0917 123 4567"), "639171234567"));
test("normalizes PH 9 mobile format", () => assert.equal(normalizeSmsRecipient("9171234567"), "639171234567"));
test("keeps explicit PH international format", () => assert.equal(normalizeSmsRecipient("+63 917 123 4567"), "639171234567"));
test("keeps explicit non-PH international numbers", () => assert.equal(normalizeSmsRecipient("+1 (415) 555-0123"), "14155550123"));
test("uses selected country for a local number", () => assert.equal(normalizeSmsRecipient("0412 345 678", "61"), "61412345678"));
test("accepts E.164-length digit strings", () => assert.equal(isValidSmsRecipient("639171234567"), true));
test("rejects short and leading-zero international values", () => {
  assert.equal(isValidSmsRecipient("1234"), false);
  assert.equal(isValidSmsRecipient("09171234567"), false);
});
test("detects supported country from recipient", () => assert.equal(smsCountryFromRecipient("639171234567"), "PH"));
test("splits a stored number for the country dropdown", () => {
  const result = splitSmsRecipient("639171234567");
  assert.equal(result.country.code, "PH");
  assert.equal(result.local, "9171234567");
});
test("masks recipient for operational screens", () => assert.equal(maskSmsRecipient("639171234567"), "639•••••4567"));
