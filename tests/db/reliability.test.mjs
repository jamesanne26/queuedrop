import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(new URL("../../supabase/migrations/20261006050000_queue_reliability.sql", import.meta.url), "utf8");
const device = "00000000-0000-4000-8000-000000000001";
const branch = "00000000-0000-4000-8000-000000000002";
const business = "00000000-0000-4000-8000-000000000003";
const token = "00000000-0000-4000-8000-000000000004";
const service = "00000000-0000-4000-8000-000000000005";
let db;

test.before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select '${business}'::uuid $$;
    create table branches(id uuid primary key, timezone text);
    create table devices(id uuid primary key,device_token uuid,device_type text,is_active boolean,last_seen_at timestamptz,updated_at timestamptz);
    create table tickets(id uuid primary key,branch_id uuid,status text,joined_at timestamptz default now(),printed_at timestamptz,updated_at timestamptz);
    create table print_jobs(id uuid primary key default gen_random_uuid(),business_id uuid,branch_id uuid,device_id uuid,ticket_id uuid,
      status text default 'pending',payload jsonb default '{}',attempt_count int default 0,claimed_at timestamptz,printed_at timestamptz,
      next_attempt_at timestamptz default now(),error_message text,created_at timestamptz default now(),updated_at timestamptz,
      constraint print_jobs_status_check check(status in ('pending','failed','printing','printed')));
    create table operating_hours(branch_id uuid,day_of_week int,is_open boolean,open_time time,close_time time);
    create table audit_logs(business_id uuid,user_id uuid,action text,entity_type text,entity_id uuid,details jsonb);
    create function can_operate_branch(uuid) returns boolean language sql as $$ select current_setting('test.allow',true) is distinct from 'false' $$;
    create table app_rate_limits(rate_key text primary key,window_started_at timestamptz default now(),hits int default 0,updated_at timestamptz);
    create sequence issuance;
    create function issue_stub_ticket_for_service(target_device_token uuid,target_service_id uuid) returns jsonb
    language plpgsql as $$ declare v_ticket_number integer; begin
      v_ticket_number:=nextval('issuance');
      return jsonb_build_object('display_number','Q'||lpad(v_ticket_number::text,3,'0'),'ticket_id',gen_random_uuid());
    end $$;
    create function enforce_ticket_subscription_access() returns trigger language plpgsql as $$ begin
      if new.status is distinct from old.status and new.status not in ('completed','cancelled','no_show')
        and current_setting('test.expired',true)='true' then raise exception 'Expired'; end if;
      return new;
    end $$;
    create trigger subscription_check before update of status on tickets for each row execute function enforce_ticket_subscription_access();
    insert into branches values('${branch}','Asia/Manila');
    insert into devices(id,device_token,device_type,is_active) values('${device}','${token}','ticket_terminal',true);
  `);
  const rateSource = await readFile(new URL("../../supabase/migrations/20260912033000_production_security_hardening.sql", import.meta.url),"utf8");
  await db.exec(rateSource.match(/create or replace function public.consume_app_rate_limit[\s\S]*?\$\$;/i)[0]);
  await db.exec(migration);
});
test.after(async () => { await db?.close(); });
test.beforeEach(async () => {
  await db.exec("delete from print_jobs; delete from tickets; delete from operating_hours; delete from stub_requests; delete from app_rate_limits; set test.allow='true'; set test.expired='false';");
});

async function seed(status="waiting", jobStatus="pending", attempt=0, age="0 minutes") {
  const [{ id: ticketId }] = (await db.query("insert into tickets(id,branch_id,status) values(gen_random_uuid(),$1,$2) returning id",[branch,status])).rows;
  const [{ id: jobId }] = (await db.query(`insert into print_jobs(business_id,branch_id,device_id,ticket_id,status,attempt_count,claimed_at)
    values($1,$2,$3,$4,$5,$6,now()-$7::interval) returning id`,[business,branch,device,ticketId,jobStatus,attempt,age])).rows;
  return {ticketId,jobId};
}
async function rpc(sql,args=[]) { return (await db.query(sql,args)).rows[0].result; }
async function job(id) { return (await db.query("select * from print_jobs where id=$1",[id])).rows[0]; }

test("migration reapplies safely", async () => { await db.exec(migration); });
test("numbers preserve all digits after 999", async () => {
  for(const [n,expected] of [[1,"001"],[999,"999"],[1000,"1000"],[10001,"10001"]])
    assert.equal(await rpc("select format_queue_number($1) result",[n]),expected);
});
for(const status of ["cancelled","completed","no_show","not_completed"]) {
  test(`${status} cancels pending, failed and in-flight print jobs`,async () => {
    for(const initial of ["pending","failed","printing","uncertain"]) {
      const {ticketId,jobId}=await seed("waiting",initial);
      await db.query("update tickets set status=$1 where id=$2",[status,ticketId]);
      assert.equal((await job(jobId)).status,"cancelled");
      assert.equal(await rpc("select complete_print_job($1,$2,false,'Disconnected') result",[token,jobId]),false);
    }
    assert.equal(await rpc("select claim_next_print_job($1) result",[token]),null);
  });
}
test("reconnect skips cancelled backlog and claims the active stub",async () => {
  const cancelled=await seed(); const active=await seed();
  await db.query("update tickets set status='cancelled' where id=$1",[cancelled.ticketId]);
  const claimed=await rpc("select claim_next_print_job($1) result",[token]);
  assert.equal(claimed.ticketId,active.ticketId);
  assert.equal((await job(cancelled.jobId)).status,"cancelled");
});
test("abandoned printing becomes uncertain without automatic duplicate printing",async () => {
  const {jobId}=await seed("waiting","printing",1,"3 minutes");
  assert.equal(await rpc("select claim_next_print_job($1) result",[token]),null);
  assert.equal((await job(jobId)).status,"uncertain");
});
test("printer failure retries but exhausted jobs require intervention",async () => {
  const {jobId}=await seed();
  await rpc("select claim_next_print_job($1) result",[token]);
  assert.equal(await rpc("select complete_print_job($1,$2,false,'Disconnected') result",[token,jobId]),true);
  assert.equal((await job(jobId)).status,"failed");
  assert.equal(await rpc("select claim_next_print_job($1) result",[token]),null);
  await db.query("update print_jobs set attempt_count=5,next_attempt_at=now() where id=$1",[jobId]);
  assert.equal(await rpc("select claim_next_print_job($1) result",[token]),null);
});
test("same stub can be reprinted with an audit record",async () => {
  const {jobId,ticketId}=await seed("waiting","uncertain",5);
  assert.equal(await rpc("select requeue_print_job($1) result",[jobId]),true);
  assert.equal((await job(jobId)).ticket_id,ticketId);
  assert.equal((await job(jobId)).attempt_count,0);
  assert.equal((await db.query("select action from audit_logs order by action")).rows.some(r=>r.action==="print.requeued"),true);
});
test("cancelled stub cannot be reprinted",async () => {
  const {jobId}=await seed("cancelled","cancelled");
  await assert.rejects(rpc("select requeue_print_job($1) result",[jobId]),/Only active/);
});
test("branch authorization protects manual reprint",async () => {
  const {jobId}=await seed("waiting","failed");
  await db.exec("set test.allow='false'");
  await assert.rejects(rpc("select requeue_print_job($1) result",[jobId]),/Not authorized/);
});
test("wrong device cannot acknowledge a print job",async () => {
  const {jobId}=await seed();
  await assert.rejects(rpc("select complete_print_job($1,$2,true,null) result",[service,jobId]),/Terminal not found/);
});
test("duplicate retry returns the same ticket and increments issuance once",async () => {
  const id=crypto.randomUUID();
  const first=await rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,service,id]);
  const second=await rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,service,id]);
  assert.deepEqual(second,first);
  assert.equal((await db.query("select count(*)::int count from stub_requests")).rows[0].count,1);
});
test("request id cannot be reused for a different service",async () => {
  const id=crypto.randomUUID();
  await rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,service,id]);
  await assert.rejects(rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,branch,id]),/different service/);
});
test("direct RPC requests enforce the database rate limit",async () => {
  await db.query("insert into app_rate_limits(rate_key,hits) values(md5('stub:'||$1),120)",[token]);
  await assert.rejects(rpc("select issue_stub_ticket_for_service($1,$2) result",[token,service]),/Too many/);
});
test("end-of-day is idempotent and cleans expired subscriptions",async () => {
  const {ticketId,jobId}=await seed();
  await db.query("update tickets set joined_at=now()-interval '2 days' where id=$1",[ticketId]);
  await db.exec("set test.expired='true'");
  assert.equal(await rpc("select finalize_closed_branch_tickets() result"),1);
  assert.equal((await job(jobId)).status,"cancelled");
  assert.equal(await rpc("select finalize_closed_branch_tickets() result"),0);
});
test("prior-day print backlog is discarded on reconnect",async () => {
  const {ticketId,jobId}=await seed();
  await db.query("update tickets set joined_at=now()-interval '2 days' where id=$1",[ticketId]);
  assert.equal(await rpc("select claim_next_print_job($1) result",[token]),null);
  assert.equal((await job(jobId)).status,"cancelled");
});

for (const [name, joined, check, ended] of [
  ["evening shift survives midnight", "2026-10-05T15:00:00Z", "2026-10-05T17:00:00Z", false],
  ["after midnight belongs to previous shift", "2026-10-05T17:00:00Z", "2026-10-05T17:30:00Z", false],
  ["overnight shift ends at closing", "2026-10-05T15:00:00Z", "2026-10-05T18:00:00Z", true],
]) {
  test(name, async () => {
    await db.query("insert into operating_hours values($1,1,true,'22:00','02:00')", [branch]);
    assert.equal(await rpc("select ticket_queue_deadline($1,$2::timestamptz)<=$3::timestamptz result",[branch,joined,check]),ended);
  });
}
test("normal business session closes on the same local day",async () => {
  await db.query("insert into operating_hours values($1,1,true,'08:00','17:00')",[branch]);
  assert.equal(await rpc("select ticket_queue_deadline($1,'2026-10-05T01:00:00Z')='2026-10-05T09:00:00Z'::timestamptz result",[branch]),true);
});
test("old active tickets cannot be manually reprinted",async () => {
  const {ticketId,jobId}=await seed("waiting","failed");
  await db.query("update tickets set joined_at=now()-interval '2 days' where id=$1",[ticketId]);
  await assert.rejects(rpc("select requeue_print_job($1) result",[jobId]),/session has ended/);
});
test("printed acknowledgments cannot rewrite a completed job",async () => {
  const {jobId}=await seed();
  await rpc("select claim_next_print_job($1) result",[token]);
  assert.equal(await rpc("select complete_print_job($1,$2,true,null) result",[token,jobId]),true);
  assert.equal(await rpc("select complete_print_job($1,$2,false,'late') result",[token,jobId]),false);
  assert.equal((await job(jobId)).status,"printed");
});

test("disabled terminal cannot recover cached issuance",async()=>{
  const requestId=crypto.randomUUID();
  await rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,service,requestId]);
  await db.query("update devices set is_active=false where id=$1",[device]);
  try {await assert.rejects(rpc("select issue_stub_ticket_request($1,$2,$3) result",[token,service,requestId]),/disabled/);}
  finally {await db.query("update devices set is_active=true where id=$1",[device]);}
});
test("late acknowledgment after queue session expiry cannot revive printing",async()=>{
  const {ticketId,jobId}=await seed("waiting","printing",1);
  await db.query("update tickets set joined_at=now()-interval '2 days' where id=$1",[ticketId]);
  assert.equal(await rpc("select complete_print_job($1,$2,true,null) result",[token,jobId]),false);
  assert.equal((await job(jobId)).status,"cancelled");
});
