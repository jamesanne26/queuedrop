import test from "node:test";
import assert from "node:assert/strict";
import { displayedTvServices, validateTvSettings, visibleTvTicket } from "../../lib/tv/config.ts";
import { normalizePlatformContact } from "../../lib/platform/contact.ts";
const ids = Array.from({length:8},(_,i)=>"00000000-0000-4000-8000-"+String(i+1).padStart(12,"0"));
const services = ids.map((id,i)=>({id,name:"Service "+i,is_active:i!==7}));
test("TV defaults to four active services and supports six",()=> {
  assert.equal(displayedTvServices(services,null).length,4);
  assert.equal(displayedTvServices(services,{service_count:6,service_ids:[]}).length,6);
});
test("TV preserves selected order and excludes removed/inactive/foreign services",()=> {
  assert.deepEqual(displayedTvServices(services.slice(0,3),{service_count:4,service_ids:[ids[2],ids[0],ids[7],ids[6]]}).map(s=>s.id),[ids[2],ids[0]]);
});
test("TV rejects invalid counts, duplicate IDs and over-capacity selections",()=>{
  for(const count of [0,7,1.5,NaN,Infinity]) assert.ok(validateTvSettings(count,[]));
  assert.ok(validateTvSettings(1,[ids[0],ids[1]]));
  assert.ok(validateTvSettings(2,[ids[0],ids[0]]));
  assert.ok(validateTvSettings(2,["../path"]));
  assert.equal(validateTvSettings(6,ids.slice(0,6)),null);
});
test("TV events exclude other branch, session, unselected service and closed tickets",()=>{
  const ticket={id:ids[0],branch_id:ids[1],service_id:ids[2],queue_session_id:ids[3],display_number:"Q1000",status:"waiting",joined_at:"2026-10-07T00:00:00Z",called_at:null,serving_at:null};
  assert.equal(visibleTvTicket(ticket,ids[1],[ids[3]],[ids[2]]),true);
  for(const patch of [{branch_id:ids[4]},{service_id:ids[4]},{queue_session_id:ids[4]},{status:"cancelled"},{status:"completed"}])
    assert.equal(visibleTvTicket({...ticket,...patch},ids[1],[ids[3]],[ids[2]]),false);
});
test("public phone supports clear, PH and international numbers without executable tel content",()=>{
  assert.equal(normalizePlatformContact(""),null);
  assert.equal(normalizePlatformContact("0917 123 4567"),"+639171234567");
  assert.equal(normalizePlatformContact("+1 (202) 555-0123"),"+12025550123");
  for(const phone of ["javascript:alert(1)","+63?foo=1","abc","123","++639171234567","+00000000"]) assert.throws(()=>normalizePlatformContact(phone));
});
