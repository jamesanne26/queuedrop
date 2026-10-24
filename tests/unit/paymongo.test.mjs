import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validPayMongoSignature, verifiedPayMongoAmount, verifiedPayMongoExpectedAmount } from "../../lib/billing/paymongo.ts";
test("PayMongo signature validation accepts matching live signature",()=>{const raw='{"ok":true}',secret="secret",t=String(Math.floor(Date.now()/1000));const sig=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");assert.equal(validPayMongoSignature(raw,`t=${t},li=${sig}`,secret),true);});
test("PayMongo signature validation rejects tampering",()=>{assert.equal(validPayMongoSignature("x","t=1,li="+"0".repeat(64),"secret"),false);});

import { normalizePayMongoPaidEvent } from "../../lib/billing/paymongo.ts";

test("normalizes checkout_session.payment.paid using checkout reference and nested paid payment",()=>{
  const result=normalizePayMongoPaidEvent({data:{attributes:{type:"checkout_session.payment.paid",data:{id:"cs_123",attributes:{reference_number:"order-123",payments:[{id:"pay_123",attributes:{status:"paid",amount:129900,currency:"PHP",paid_at:123,source:{type:"card"}}}]}}}}});
  assert.equal(result?.reference,"order-123");
  assert.equal(result?.paymentId,"pay_123");
  assert.equal(result?.attributes.amount,129900);
});

test("does not pretend a payment.paid without an external reference is fulfillable",()=>{
  const result=normalizePayMongoPaidEvent({data:{attributes:{type:"payment.paid",data:{id:"pay_123",attributes:{amount:129900,currency:"PHP",external_reference_number:null}}}}});
  assert.equal(result,null);
});


test("checkout payment selects the paid payment even when it is not first", () => {
  const event = { data: { attributes: { type: "checkout_session.payment.paid", data: { attributes: {
    reference_number: "order-456",
    payments: [
      { id: "failed", attributes: { status: "failed" } },
      { id: "paid", attributes: { status: "paid", amount: 49900, currency: "PHP" } },
    ],
  } } } } };
  assert.equal(normalizePayMongoPaidEvent(event)?.paymentId, "paid");
});

test("checkout missing reference is not fulfillable", () => {
  assert.equal(normalizePayMongoPaidEvent({ data: { attributes: {
    type: "checkout_session.payment.paid", data: { attributes: {
      payments: [{ id: "pay_123", attributes: { status: "paid" } }],
    } },
  } } }), null);
});

test("checkout without payment id is not fulfillable", () => {
  assert.equal(normalizePayMongoPaidEvent({ data: { attributes: {
    type: "checkout_session.payment.paid", data: { attributes: {
      reference_number: "order-123", payments: [{}],
    } },
  } } }), null);
});

test("unrecognized and unpaid event types cannot activate access", () => {
  for (const type of ["payment.failed", "checkout_session.payment.failed", "subscription.invoice.paid"]) {
    assert.equal(normalizePayMongoPaidEvent({ data: { attributes: {
      type, data: { id: "pay_123", attributes: { reference_number: "order-123" } },
    } } }), null);
  }
});

test("payment.paid requires reference and uses payment id", () => {
  assert.equal(normalizePayMongoPaidEvent({ data: { attributes: {
    type: "payment.paid", data: { id: "pay_456", attributes: {
      external_reference_number: "order-456", amount: 49900, currency: "PHP",
    } },
  } } })?.paymentId, "pay_456");
});

test("invalid webhook signatures are rejected", () => {
  assert.equal(validPayMongoSignature("{}", null, "secret"), false);
  assert.equal(validPayMongoSignature("{}", "t=1,li=invalid", "secret"), false);
  assert.equal(validPayMongoSignature("{}", "t=1,li=" + "0".repeat(64), undefined), false);
});

test("checkout with only failed payments must not activate subscription", () => {
  const event = {
    data: {
      attributes: {
        type: "checkout_session.payment.paid",
        data: {
          attributes: {
            reference_number: "order-123",
            payments: [{ id: "pay_failed", attributes: { status: "failed", amount: 49900, currency: "PHP" } }],
          },
        },
      },
    },
  };
  assert.equal(normalizePayMongoPaidEvent(event), null);
});


test("PayMongo amount verification rejects missing, malformed and wrong-currency values", () => {
  for (const value of [undefined, null, "49900", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(verifiedPayMongoAmount(value, "PHP", "PHP"), null);
  }
  assert.equal(verifiedPayMongoAmount(49900, undefined, "PHP"), null);
  assert.equal(verifiedPayMongoAmount(49900, "USD", "PHP"), null);
  assert.equal(verifiedPayMongoAmount(49900, "php", "PHP"), 499);
});

test("checkout and initial invoice require exact provider minor units", () => {
  assert.equal(verifiedPayMongoExpectedAmount(49900, "PHP", 499, "PHP"), 499);
  assert.equal(verifiedPayMongoExpectedAmount(49901, "PHP", 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49899, "PHP", 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(undefined, "PHP", 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49900, undefined, 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49900, "USD", 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount("49900", "PHP", 499, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49900, "PHP", 499.0005, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49900, "PHP", Number.NaN, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(49900, "PHP", 0, "PHP"), null);
  assert.equal(verifiedPayMongoExpectedAmount(50001, "PHP", 500.01, "PHP"), 500.01);
});

function signedHeader(raw, timestamp, field = "li") {
  const sig = crypto.createHmac("sha256", "secret").update(`${timestamp}.${raw}`).digest("hex");
  return `t=${timestamp},${field}=${sig}`;
}

test("fresh signed test and live webhook deliveries are accepted", () => {
  for (const field of ["te", "li"]) {
    assert.equal(validPayMongoSignature("{}", signedHeader("{}", 1000, field), "secret", 1000), true);
  }
});

test("signed replay age and future clock skew are bounded to five minutes", () => {
  for (const offset of [-300, 300]) {
    assert.equal(validPayMongoSignature("{}", signedHeader("{}", 1000 + offset), "secret", 1000), true);
  }
  for (const offset of [-301, 301]) {
    assert.equal(validPayMongoSignature("{}", signedHeader("{}", 1000 + offset), "secret", 1000), false);
  }
});

test("a provider retry can use a fresh signature for an older event body", () => {
  const raw = '{"data":{"attributes":{"created_at":1}}}';
  assert.equal(validPayMongoSignature(raw, signedHeader(raw, 1000), "secret", 1000), true);
});

test("signed timestamps must be finite safe integer Unix seconds", () => {
  for (const timestamp of ["NaN", "Infinity", "1e3", "1000.5", "-1000", "9007199254740992", ""]) {
    assert.equal(validPayMongoSignature("{}", signedHeader("{}", timestamp), "secret", 1000), false);
  }
});

test("duplicate header fields cannot override the signed timestamp or signature", () => {
  const header = signedHeader("{}", 1000);
  assert.equal(validPayMongoSignature("{}", header + ",t=1000", "secret", 1000), false);
  assert.equal(validPayMongoSignature("{}", header + ",li=" + "0".repeat(64), "secret", 1000), false);
});

test("fresh signatures still reject body changes and a different secret", () => {
  const header = signedHeader("{}", 1000);
  assert.equal(validPayMongoSignature('{"changed":true}', header, "secret", 1000), false);
  assert.equal(validPayMongoSignature("{}", header, "different", 1000), false);
});
