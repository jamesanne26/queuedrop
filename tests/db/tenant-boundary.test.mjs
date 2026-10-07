import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const boundaryMigration = await readFile(new URL('../../supabase/migrations/20261007144253_tenant_boundary_hardening.sql', import.meta.url), 'utf8');
const browserMigration = await readFile(new URL('../../supabase/migrations/20261007145134_browser_ticket_database_rate_limit.sql', import.meta.url),'utf8');
const migration = boundaryMigration + browserMigration;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
let db;
test.before(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table branches(id uuid primary key,business_id uuid);
    create table business_users(business_id uuid,user_id uuid,role_id uuid,is_active boolean);
    create table branch_users(branch_id uuid,user_id uuid);
    create table services(id uuid primary key,branch_id uuid);
    create table devices(id uuid primary key,branch_id uuid,service_id uuid);
    create table business_services(id uuid primary key,business_id uuid);
    create table branch_service_catalog(branch_id uuid,business_service_id uuid,service_id uuid);
    create table roles(id uuid primary key,business_id uuid);
    create table business_subscriptions(business_id uuid,status text);
    create table subscription_orders(business_id uuid,amount numeric,status text);
    create table app_rate_limits(rate_key text primary key,window_started_at timestamptz default now(),hits int default 0,updated_at timestamptz);
    create function issue_browser_queue_ticket(uuid) returns jsonb language sql security definer as $$ select '{"ticket":"synthetic"}'::jsonb $$;
    create function set_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;
    create function legacy_internal_trigger() returns trigger language plpgsql security definer as $$ begin return new; end $$;
    grant all on all tables in schema public to authenticated;
    grant execute on function legacy_internal_trigger() to anon,authenticated;
    insert into branches values('${id(1)}','${id(11)}'),('${id(2)}','${id(12)}');
    insert into services values('${id(21)}','${id(1)}'),('${id(22)}','${id(2)}');
    insert into business_users values('${id(11)}','${id(31)}',null,true);
    insert into branch_users values('${id(1)}','${id(31)}');
    insert into roles values('${id(41)}','${id(11)}'),('${id(42)}','${id(12)}');
    insert into business_services values('${id(51)}','${id(11)}'),('${id(52)}','${id(12)}');
    insert into devices values('${id(61)}','${id(1)}','${id(21)}');
    set request.jwt.claim.sub='${id(31)}';
  `);
  const rateSource=await readFile(new URL('../../supabase/migrations/20260912033000_production_security_hardening.sql',import.meta.url),'utf8');
  await db.exec(rateSource.match(/create or replace function public.consume_app_rate_limit[\s\S]*?\$\$;/i)[0]);
  await db.exec(migration);
});
test.after(async () => { await db?.close(); });
const member = async branch => (await db.query('select is_branch_member($1) allowed',[branch])).rows[0].allowed;
test('active assignment gives access only inside the matching tenant', async () => {
  assert.equal(await member(id(1)),true); assert.equal(await member(id(2)),false);
});
test('disabling an employee immediately revokes a stale branch assignment', async () => {
  await db.exec('begin');
  try { await db.exec('update business_users set is_active=false'); assert.equal(await member(id(1)),false); }
  finally { await db.exec('rollback'); }
});
test('deleting tenant membership immediately revokes a stale assignment', async () => {
  await db.exec('begin');
  try { await db.exec('delete from business_users'); assert.equal(await member(id(1)),false); }
  finally { await db.exec('rollback'); }
});
for (const [name,sql] of [
  ['foreign device service',`update devices set service_id='${id(22)}' where id='${id(61)}'`],
  ['moving a device with its old service',`update devices set branch_id='${id(2)}' where id='${id(61)}'`],
  ['foreign business employee assignment',`insert into branch_users values('${id(2)}','${id(31)}')`],
  ['foreign employee role',`update business_users set role_id='${id(42)}'`],
  ['foreign catalog template',`insert into branch_service_catalog values('${id(1)}','${id(52)}','${id(21)}')`],
  ['foreign catalog service',`insert into branch_service_catalog values('${id(1)}','${id(51)}','${id(22)}')`],
]) test(`database rejects ${name}`,async () => {
  await assert.rejects(db.exec(sql), error => error.code === '23514');
});
test('valid own-tenant setup and nullable device service still work', async () => {
  await db.exec('begin');
  try {
    await db.exec(`update devices set service_id=null; update devices set service_id='${id(21)}';
      update business_users set role_id='${id(41)}';
      insert into branch_service_catalog values('${id(1)}','${id(51)}','${id(21)}');`);
  } finally { await db.exec('rollback'); }
});
test('client database role cannot forge billing writes',async () => {
  await db.exec('set role authenticated');
  try {
    await assert.rejects(db.exec(`insert into business_subscriptions values('${id(11)}','active')`),error=>error.code==='42501');
    await assert.rejects(db.exec(`insert into subscription_orders values('${id(11)}',1,'paid')`),error=>error.code==='42501');
  } finally { await db.exec('reset role'); }
});
test('internal triggers are not executable public RPCs',async () => {
  for(const role of ['anon','authenticated']) {
    const {rows}=await db.query("select has_function_privilege($1,'legacy_internal_trigger()','EXECUTE') allowed",[role]);
    assert.equal(rows[0].allowed,false);
  }
});
test('migration can be reapplied safely',async()=>{ await db.exec(migration); });
test('direct anonymous browser issuance cannot bypass the database rate limit',async()=>{
  await db.exec('begin');
  try {
    await db.exec('set role anon');
    for(let n=0;n<120;n++) await db.query('select issue_browser_queue_ticket($1)',[id(71)]);
    await db.exec('savepoint rate_rejection');
    await assert.rejects(db.query('select issue_browser_queue_ticket($1)',[id(71)]),/Too many ticket requests/);
    await db.exec('rollback to savepoint rate_rejection');
    await assert.rejects(db.query('select issue_browser_queue_ticket_internal($1)',[id(71)]),error=>error.code==='42501');
  } finally { await db.exec('rollback'); }
});
