import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validPayMongoSignature } from "../../lib/billing/paymongo.ts";
test("PayMongo signature validation accepts matching live signature",()=>{const raw='{"ok":true}',secret="secret",t="123";const sig=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");assert.equal(validPayMongoSignature(raw,`t=${t},li=${sig}`,secret),true);});
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
