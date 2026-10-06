import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url));
const hook=registerHooks({resolve(specifier,context,next){
  if(specifier==="@/lib/supabase/admin") return {url:"data:text/javascript,export function createAdminClient(){return globalThis.__smsRegressionAdmin}",shortCircuit:true};
  if(specifier.startsWith("@/")) return {url:pathToFileURL(path.join(root,specifier.slice(2)+".ts")).href,shortCircuit:true};
  return next(specifier,context);
}});
const {processPendingSmsNotifications,dispatchSmsAfterQueueChange}=await import("../../lib/notifications/sms.ts");
hook.deregister();
function fixture({ticketStatus="waiting",persistFailure=false}={}) {
  const updates=[];const methods=["primary","fallback"].map(id=>({id,name:id,method_type:"cloud_provider",provider_code:"generic",country_code:"PH",is_enabled:true,priority:1,api_base_url:"https://sms.example.com/send",secret_env_key:"SMS_REGRESSION_KEY",config:{transport:"generic_http"}}));
  class Query {
    constructor(table){this.table=table;this.filters=[];}
    select(){return this;} eq(key,value){this.filters.push([key,value]);return this;}
    or(){return this;} order(){return this;} limit(){return this;} maybeSingle(){return this;} single(){return this;}
    update(value){this.change=value;return this;} insert(value){this.inserted=value;return this;}
    then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
    result(){
      if(this.change){updates.push({table:this.table,...this.change});
        if(persistFailure&&this.table==="notifications"&&this.change.status==="sent")return {data:null,error:{message:"database write failed"}};
        return {data:this.change.status==="processing"?{id:"notification"}:null,error:null};}
      if(this.inserted)return {data:{id:"attempt"},error:null};
      if(this.table==="tickets")return {data:{status:ticketStatus},error:null};
      if(this.table==="notifications")return {data:[{id:"notification",ticket_id:"ticket",business_id:"business",branch_id:"branch",recipient:"639171234567",message:"Queue ready",attempt_count:0}],error:null};
      if(this.table==="sms_routing_rules")return {data:[{id:"route",scope_type:"system",primary_method_id:"primary",fallback_method_ids:["fallback"],routing_policy:"manual_priority",retry_limit:2,failover_after_seconds:5}],error:null};
      if(this.table==="sms_delivery_methods")return {data:methods,error:null};
      throw new Error(`Unexpected table ${this.table}`);
    }
  }
  globalThis.__smsRegressionAdmin={from:table=>new Query(table)};
  return updates;
}
test.beforeEach(()=>{process.env.SMS_REGRESSION_KEY="fixture";process.env.SMS_DRY_RUN="false";});
test.afterEach(()=>{test.mock.restoreAll();delete globalThis.__smsRegressionAdmin;delete process.env.SMS_REGRESSION_KEY;delete process.env.SMS_DRY_RUN;delete process.env.SMS_DELIVERY_PAUSED;});
test("SMS timeout stops failover and marks delivery for review",async()=>{
  const updates=fixture();let calls=0;
  test.mock.method(globalThis,"fetch",async()=>{calls++;throw new DOMException("timeout","TimeoutError");});
  const result=await processPendingSmsNotifications();assert.equal(calls,1);assert.equal(result.failed,1);
  assert.match(updates.at(-1).last_error,/Review provider/);
});
test("accepted SMS is not sent twice when database confirmation fails",async()=>{
  const updates=fixture({persistFailure:true});let calls=0;
  test.mock.method(globalThis,"fetch",async()=>{calls++;return new Response('{"id":"sent-1"}',{status:200});});
  const result=await processPendingSmsNotifications();assert.equal(calls,1);assert.equal(result.failed,1);
  assert.match(updates.at(-1).last_error,/Review provider/);
});
test("explicit provider rejection can safely use configured fallback",async()=>{
  fixture();let calls=0;
  test.mock.method(globalThis,"fetch",async()=>{calls++;return new Response(calls===1?"Rejected":'{"id":"sent-2"}',{status:calls===1?400:200});});
  const result=await processPendingSmsNotifications();assert.equal(calls,2);assert.equal(result.sent,1);
});
test("server error with uncertain acceptance does not trigger duplicate fallback",async()=>{
  fixture();let calls=0;
  test.mock.method(globalThis,"fetch",async()=>{calls++;return new Response("Server error",{status:500});});
  assert.equal((await processPendingSmsNotifications()).failed,1);assert.equal(calls,1);
});
for(const ticketStatus of ["cancelled","completed","not_completed","serving"]){
  test(`obsolete ${ticketStatus} ticket suppresses SMS`,async()=>{
    fixture({ticketStatus});let calls=0;test.mock.method(globalThis,"fetch",async()=>{calls++;throw new Error("Must not send");});
    assert.equal((await processPendingSmsNotifications()).failed,1);assert.equal(calls,0);
  });
}
test("worker leaves abandoned delivery in review instead of blindly retrying",async()=>{
  const updates=fixture();test.mock.method(globalThis,"fetch",async()=>new Response('{"id":"ok"}',{status:200}));
  await processPendingSmsNotifications();assert.equal(updates[0].status,"failed");assert.match(updates[0].last_error,/Review provider/);
});

test("paused SMS leaves pending records untouched and never contacts provider", async () => {
  process.env.SMS_DELIVERY_PAUSED="true";
  globalThis.__smsRegressionAdmin={from(){throw new Error("Paused delivery must not touch database");},rpc(){throw new Error("Paused delivery must not enqueue");}};
  let calls=0;
  test.mock.method(globalThis,"fetch",async()=>{calls++;throw new Error("Paused delivery must not send");});
  const result=await processPendingSmsNotifications();
  assert.deepEqual(result,{sent:0,failed:0,retried:0,claimed:0,skipped:true});
  await dispatchSmsAfterQueueChange("branch");
  assert.equal(calls,0);
});
