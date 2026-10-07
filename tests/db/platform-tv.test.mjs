import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const migration = await readFile(new URL("../../supabase/migrations/20261007062919_platform_contact_and_branch_tv.sql",import.meta.url),"utf8");
const uuid = n => "00000000-0000-4000-8000-"+String(n).padStart(12,"0");
let db;
test.before(async()=>{
  db=new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table system_owners(user_id uuid primary key,is_active boolean);
    create table branches(id uuid primary key,business_id uuid);
    create table services(id uuid primary key,branch_id uuid,name text,is_active boolean);
    create function is_business_admin(uuid) returns boolean language sql as $$ select auth.uid()='${uuid(1)}'::uuid and $1='${uuid(2)}'::uuid $$;
    alter table branches enable row level security;
    create policy branches_read on branches for select to authenticated using (auth.uid()='${uuid(1)}'::uuid and business_id='${uuid(2)}'::uuid);
    grant usage on schema auth to authenticated;
    grant select on branches,services,system_owners to authenticated;
    insert into branches values ('${uuid(3)}','${uuid(2)}'),('${uuid(4)}','${uuid(9)}');
    insert into services values ('${uuid(5)}','${uuid(3)}','Active',true),('${uuid(6)}','${uuid(4)}','Foreign',true),('${uuid(7)}','${uuid(3)}','Inactive',false);
    insert into system_owners values ('${uuid(1)}',true);
  `);
  await db.exec(migration);
});
test.after(async()=>await db?.close());
test.beforeEach(async()=>await db.exec(`reset role;set test.uid='${uuid(1)}';delete from platform_public_contact;delete from branch_tv_settings;update system_owners set is_active=true;set role authenticated;`));
async function insert(ids=[],count=4,branch=uuid(3)){return db.query("insert into branch_tv_settings(branch_id,service_count,service_ids) values($1,$2,$3)",[branch,count,ids]);}
test("valid admin configuration persists",async()=>{
  await insert([uuid(5)],1);
  assert.equal((await db.query("select service_count from branch_tv_settings")).rows[0].service_count,1);
});
test("constraints reject zero, seven and over-capacity settings",async()=>{
  await assert.rejects(insert([],0),/check constraint/);
  await assert.rejects(insert([],7),/check constraint/);
  await assert.rejects(insert([uuid(5),uuid(5)],1),/check constraint|unique active/);
});
test("trigger rejects foreign, inactive, missing, null and duplicate services",async()=>{
  for(const ids of [[uuid(6)],[uuid(7)],[uuid(8)],[null],[uuid(5),uuid(5)]]) await assert.rejects(insert(ids),/unique active services/);
});
test("RLS rejects writes and branch reassignment outside own business",async()=>{
  await assert.rejects(insert([],4,uuid(4)),/row-level security/);
  await insert();
  await assert.rejects(db.query("update branch_tv_settings set branch_id=$1",[uuid(4)]),/row-level security/);
});
test("foreign user cannot read TV settings or overwrite contact",async()=>{
  await insert(); await db.query("insert into platform_public_contact(id,phone) values(true,'+639171234567')");
  await db.exec(`set test.uid='${uuid(9)}'`);
  assert.equal((await db.query("select * from branch_tv_settings")).rows.length,0);
  assert.equal((await db.query("update platform_public_contact set phone=null returning phone")).rows.length,0);
});
test("only active system owner can save/clear public contact",async()=>{
  await db.query("insert into platform_public_contact values(true,'+639171234567')");
  await db.query("update platform_public_contact set phone=null");
  assert.equal((await db.query("select phone from platform_public_contact")).rows[0].phone,null);
  await db.exec("reset role;update system_owners set is_active=false;set role authenticated");
  assert.equal((await db.query("update platform_public_contact set phone='+639171234567' returning phone")).rows.length,0);
});
test("anonymous can read public phone but cannot modify it or read branch configuration",async()=>{
  await db.query("insert into platform_public_contact values(true,'+639171234567')");
  await db.exec("set role anon");
  assert.deepEqual((await db.query("select * from platform_public_contact")).rows,[{id:true,phone:"+639171234567"}]);
  await assert.rejects(db.query("update platform_public_contact set phone=null"),/permission denied/);
  await assert.rejects(db.query("select * from branch_tv_settings"),/permission denied/);
});
test("database rejects dangerous phone values even outside UI",async()=>{
  for(const phone of ["javascript:alert(1)","09171234567","+000000000","https://bad.example"]) await assert.rejects(db.query("insert into platform_public_contact values(true,$1)",[phone]),/check constraint/);
});
test("branch deletion cascades its TV configuration",async()=>{
  await insert();await db.exec("reset role");
  await db.query("delete from branches where id=$1",[uuid(3)]);
  assert.equal((await db.query("select * from branch_tv_settings")).rows.length,0);
});
