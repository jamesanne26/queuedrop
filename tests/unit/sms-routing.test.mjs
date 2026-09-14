import test from "node:test";
import assert from "node:assert/strict";
import { orderSmsMethodsForRule, validateRouteMethodSelection } from "../../lib/notifications/sms-routing.ts";

const methods = [
  {id:"cloud",name:"Cloud",method_type:"cloud_provider",country_code:"PH",is_enabled:true,priority:2,cost_per_sms:1},
  {id:"android",name:"Android",method_type:"android_gateway",country_code:"PH",is_enabled:true,priority:1,cost_per_sms:0.5},
  {id:"disabled",name:"Disabled",method_type:"cloud_provider",country_code:"PH",is_enabled:false,priority:3,cost_per_sms:0.1},
  {id:"us",name:"US",method_type:"cloud_provider",country_code:"US",is_enabled:true,priority:1,cost_per_sms:0.2},
];

test("route selection only accepts enabled methods for the country", () => {
  const result = validateRouteMethodSelection({countryCode:"PH",primaryMethodId:"cloud",fallbackMethodIds:["android","android","cloud"],methods});
  assert.equal(result.primary.id, "cloud");
  assert.deepEqual(result.fallbackMethodIds, ["android"]);
  assert.throws(() => validateRouteMethodSelection({countryCode:"PH",primaryMethodId:"disabled",fallbackMethodIds:[],methods}));
  assert.throws(() => validateRouteMethodSelection({countryCode:"PH",primaryMethodId:"cloud",fallbackMethodIds:["us"],methods}));
});

test("routing policies select the correct provider family", () => {
  assert.deepEqual(orderSmsMethodsForRule({primary_method_id:"cloud",fallback_method_ids:["android"],routing_policy:"cloud_only"}, methods).map(x=>x.id), ["cloud","disabled","us"]);
  assert.deepEqual(orderSmsMethodsForRule({primary_method_id:"cloud",fallback_method_ids:["android"],routing_policy:"android_only"}, methods).map(x=>x.id), ["android"]);
});

test("cheapest routing sorts providers by configured cost", () => {
  assert.deepEqual(orderSmsMethodsForRule({primary_method_id:null,fallback_method_ids:null,routing_policy:"cheapest"}, methods).map(x=>x.id), ["disabled","us","android","cloud"]);
});

test("manual route never silently falls through to arbitrary provider", () => {
  assert.deepEqual(orderSmsMethodsForRule({primary_method_id:"missing",fallback_method_ids:[],routing_policy:"manual"}, methods), []);
});
