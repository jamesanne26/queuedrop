import test from "node:test";
import assert from "node:assert/strict";
import { calculateTax } from "../../lib/billing/tax.ts";

test("non-VAT keeps configured price", () => assert.deepEqual(calculateTax(1299, "non_vat", 12, "exclusive"), { subtotal:1299, taxAmount:0, total:1299 }));
test("VAT exclusive adds configurable VAT", () => assert.deepEqual(calculateTax(1000, "vat", 12, "exclusive"), { subtotal:1000, taxAmount:120, total:1120 }));
test("VAT inclusive extracts VAT without changing checkout total", () => assert.deepEqual(calculateTax(1120, "vat", 12, "inclusive"), { subtotal:1000, taxAmount:120, total:1120 }));
test("VAT rate is validated", () => assert.throws(() => calculateTax(1000, "vat", 101, "exclusive")));
