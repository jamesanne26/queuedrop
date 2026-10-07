-- Run as the SQL test administrator. All fixtures and changes are rolled back.
-- The actual access attempts explicitly execute as authenticated or anon.
begin;
do $$
declare
  a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); employee uuid:=gen_random_uuid();
  ba uuid:=gen_random_uuid(); bb uuid:=gen_random_uuid(); ra uuid:=gen_random_uuid(); rb uuid:=gen_random_uuid();
  sa uuid:=gen_random_uuid(); sb uuid:=gen_random_uuid(); qa uuid:=gen_random_uuid(); qb uuid:=gen_random_uuid();
  ta uuid:=gen_random_uuid(); tb uuid:=gen_random_uuid(); cb uuid:=gen_random_uuid();
  da uuid:=gen_random_uuid(); db uuid:=gen_random_uuid(); tokb uuid:=gen_random_uuid();
  catalogb uuid:=gen_random_uuid(); roleb uuid; denied boolean; affected integer; supporta text; supportb text; reportb jsonb;
begin
  insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
    values(a,'audit-a-'||a||'@example.invalid','{}','{}',now(),now()),
      (b,'audit-b-'||b||'@example.invalid','{}','{}',now(),now()),
      (employee,'audit-staff-'||employee||'@example.invalid','{}','{}',now(),now());
  insert into businesses(id,name,slug) values(ba,'Audit A','audit-'||ba),(bb,'Audit B','audit-'||bb);
  insert into business_users(business_id,user_id,role,is_active) values(ba,a,'owner',true),(bb,b,'owner',true),(ba,employee,'staff',true);
  insert into business_subscriptions(business_id,status,expires_at) values(ba,'active',now()+interval '1 day'),(bb,'active',now()+interval '1 day');
  insert into branches(id,business_id,name,slug) values(ra,ba,'Audit A','a'),(rb,bb,'Audit B','b');
  insert into branch_users(branch_id,user_id) values(ra,a),(rb,b),(ra,employee);
  insert into services(id,branch_id,name) values(sa,ra,'Audit A'),(sb,rb,'Audit B');
  insert into queue_sessions(id,branch_id,session_date) values(qa,ra,current_date),(qb,rb,current_date);
  insert into customers(id,business_id,name) values(cb,bb,'Synthetic private customer');
  insert into tickets(id,branch_id,queue_session_id,service_id,ticket_number,display_number,customer_id)
    values(ta,ra,qa,sa,1,'A001',null),(tb,rb,qb,sb,1,'B001',cb);
  insert into devices(id,branch_id,name,device_type,service_id,device_token)
    values(da,ra,'Audit A','ticket_terminal',sa,gen_random_uuid()),(db,rb,'Audit B','ticket_terminal',sb,tokb);
  insert into business_services(id,business_id,name) values(catalogb,bb,'Audit B catalog');
  select id into roleb from roles where business_id=bb and base_role='staff' limit 1;
  assert roleb is not null,'Missing default role fixture';
  perform set_config('request.jwt.claim.sub',b::text,true);
  supportb:=public.support_exchange(public.support_start(bb));
  reportb:=public.support_call(supportb,'create','{"title":"Synthetic security audit","description":"Tenant isolation test fixture","contact_number":"09123456789"}');
  perform set_config('request.jwt.claim.sub',a::text,true);
  supporta:=public.support_exchange(public.support_start(ba));
  set local role authenticated;
  assert current_user='authenticated','Test must use client database role';
  assert public.is_business_admin(ba) and not public.is_business_admin(bb),'Tenant admin helper failed';
  assert public.is_branch_member(ra) and not public.is_branch_member(rb),'Tenant branch helper failed';
  assert exists(select 1 from tickets where id=ta),'Own ticket not readable';
  assert not exists(select 1 from businesses where id=bb),'Other business readable';
  assert not exists(select 1 from branches where id=rb),'Other branch readable';
  assert not exists(select 1 from customers where id=cb),'Other customer readable';
  assert not exists(select 1 from tickets where id=tb),'Other ticket readable';
  assert not exists(select 1 from devices where id=db),'Other device token readable';
  assert not exists(select 1 from business_users where business_id=bb),'Other team readable';
  assert not exists(select 1 from business_subscriptions where business_id=bb),'Other subscription readable';
  assert not exists(select 1 from roles where business_id=bb),'Other roles readable';
  update branches set name='Forbidden' where id=rb; get diagnostics affected=row_count;
  assert affected=0,'Other branch changed';
  update tickets set display_number='Forbidden' where id=tb; get diagnostics affected=row_count;
  assert affected=0,'Other ticket changed';
  delete from branch_users where branch_id=rb; get diagnostics affected=row_count;
  assert affected=0,'Other team deleted';
  denied:=false; begin perform public.staff_update_ticket_status(tb,'cancel'); exception when others then denied:=true; end;
  assert denied,'Cross-tenant ticket RPC accepted';
  denied:=false; begin perform public.support_start(bb); exception when others then denied:=true; end;
  assert denied,'Cross-tenant support session created';
  denied:=false; begin perform public.support_call(supporta,'detail',jsonb_build_object('id',reportb->>'id')); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Cross-tenant support report read';
  denied:=false; begin perform public.support_call(supporta,'reply',jsonb_build_object('id',reportb->>'id','body','Forbidden')); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Cross-tenant support reply accepted';
  denied:=false; begin update devices set service_id=sb where id=da; exception when check_violation then denied:=true; end;
  assert denied,'Own device accepted foreign service';
  denied:=false; begin insert into branch_users(branch_id,user_id) values(ra,b); exception when check_violation then denied:=true; end;
  assert denied,'Own branch accepted foreign business user';
  denied:=false; begin insert into branch_service_catalog(branch_id,business_service_id,service_id) values(ra,catalogb,sa); exception when check_violation then denied:=true; end;
  assert denied,'Own branch accepted foreign catalog';
  denied:=false; begin update business_users set role_id=roleb where business_id=ba and user_id=employee; exception when check_violation then denied:=true; end;
  assert denied,'Own employee accepted foreign role';
  denied:=false; begin update business_subscriptions set custom_max_branches=999,expires_at=now()+interval '100 years' where business_id=ba; exception when insufficient_privilege then denied:=true; end;
  assert denied,'Client changed trusted billing limits';
  denied:=false; begin insert into subscription_orders(business_id,requested_by,amount,subtotal,status) values(ba,a,1,1,'paid'); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Client forged trusted payment order';
  -- Positive write proves the tenant trigger does not block normal terminal setup.
  update devices set service_id=sa where id=da; get diagnostics affected=row_count; assert affected=1,'Valid own device update blocked';
  reset role;
  update business_users set is_active=false where business_id=ba and user_id=employee;
  perform set_config('request.jwt.claim.sub',employee::text,true);
  set local role authenticated;
  assert not public.is_branch_member(ra),'Disabled staff retained branch membership';
  assert not public.can_operate_branch(ra),'Disabled staff retained operation permission';
  assert not exists(select 1 from tickets where id=ta),'Disabled staff read tickets';
  update tickets set display_number='Forbidden' where id=ta; get diagnostics affected=row_count; assert affected=0,'Disabled staff changed ticket';
  reset role;
  delete from business_users where business_id=ba and user_id=employee;
  set local role authenticated;
  assert not public.is_branch_member(ra),'Removed membership retained branch access';
  assert not exists(select 1 from tickets where id=ta),'Removed staff read tickets';
  reset role;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.app_rate_limits(rate_key,window_started_at,hits,updated_at)
    values(md5('browser-ticket:'||tokb::text),now(),120,now());
  set local role anon;
  denied:=false; begin perform public.issue_browser_queue_ticket(tokb); exception when raise_exception then denied:=sqlerrm like 'Too many ticket requests%'; end;
  assert denied,'Direct browser RPC bypassed database rate limit';
  assert not has_function_privilege('anon','public.issue_browser_queue_ticket_internal(uuid)','EXECUTE'),'Browser internal implementation exposed';
  denied:=false; begin denied:=not exists(select 1 from customers where id=cb); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Anonymous customer data read';
  denied:=false; begin denied:=not exists(select 1 from tickets where id=tb); exception when insufficient_privilege then denied:=true; end;
  assert denied,'Anonymous ticket data read';
  assert not has_schema_privilege('anon','support_private','USAGE'),'Private support session exposed';
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='set_employee_access' and has_function_privilege('anon',p.oid,'EXECUTE')),'Employee configuration exposed anonymously';
  reset role;
  assert not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prorettype='trigger'::regtype and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))),'Internal trigger exposed as RPC';
end $$;
rollback;
