import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSmsRecipient } from "../../lib/notifications/phone.ts";

test("normalizes PH 09 mobile format", () => assert.equal(normalizeSmsRecipient("0917 123 4567"), "639171234567"));
test("normalizes PH 9 mobile format", () => assert.equal(normalizeSmsRecipient("9171234567"), "639171234567"));
test("keeps PH 63 mobile format", () => assert.equal(normalizeSmsRecipient("+63 917 123 4567"), "639171234567"));
test("strips formatting from other international numbers", () => assert.equal(normalizeSmsRecipient("+1 (415) 555-0123"), "14155550123"));
