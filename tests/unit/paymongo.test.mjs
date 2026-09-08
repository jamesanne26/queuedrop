import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { validPayMongoSignature } from "../../lib/billing/paymongo.ts";
test("PayMongo signature validation accepts matching live signature",()=>{const raw='{"ok":true}',secret="secret",t="123";const sig=crypto.createHmac("sha256",secret).update(`${t}.${raw}`).digest("hex");assert.equal(validPayMongoSignature(raw,`t=${t},li=${sig}`,secret),true);});
test("PayMongo signature validation rejects tampering",()=>{assert.equal(validPayMongoSignature("x","t=1,li="+"0".repeat(64),"secret"),false);});
