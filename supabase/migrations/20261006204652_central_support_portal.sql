create schema if not exists support_private;
revoke all on schema support_private from public,anon,authenticated;
create table support_private.sessions (
 token_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
 business_id uuid references public.businesses(id), owner boolean not null default false,
 kind text not null check(kind in ('handoff','session')), expires_at timestamptz not null,
 context jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table support_private.sessions enable row level security;
create index support_sessions_expiry on support_private.sessions(expires_at);
create table public.support_reports (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 app_id text not null default 'queuedrop', business_id uuid not null references public.businesses(id),
 reporter_id uuid not null references auth.users(id), title text not null check(length(title) between 3 and 160),
 description text not null check(length(description) between 10 and 10000), contact_number text not null check(length(contact_number) between 7 and 25),
 context jsonb not null default '{}', status text not null default 'received' check(status in ('received','investigating','needs_information','approved','in_progress','resolved','closed')),
 evaluation text not null default 'not_reviewed' check(evaluation in ('not_reviewed','confirmed_bug','feature_request','expected_behavior','needs_information')),
 replication text not null default 'not_tested' check(replication in ('not_tested','replicated','not_reproduced','unable_to_test')),
 severity text not null default 'unassessed' check(severity in ('unassessed','critical','high','medium','low')),
 urgency text not null default 'unassessed' check(urgency in ('unassessed','P0','P1','P2','P3')),
 approval text not null default 'pending' check(approval in ('pending','approved','hold')),
 clarification text not null default '', recommendation text not null default '', evidence text not null default '', tested_version text not null default '',
 resolution text not null default '', resolved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index support_reports_client on public.support_reports(business_id,created_at desc);
create index support_reports_status on public.support_reports(app_id,status,created_at desc);
create table public.support_messages (
 id uuid primary key default gen_random_uuid(), report_id uuid not null references public.support_reports(id) on delete cascade,
 author_id uuid not null references auth.users(id), body text not null check(length(body) between 1 and 10000), created_at timestamptz not null default now()
);
create index support_messages_report on public.support_messages(report_id,created_at);
create table public.support_links (
 report_id uuid not null references public.support_reports(id), related_id uuid not null references public.support_reports(id),
 kind text not null check(kind in ('suspected','confirmed')), primary key(report_id,related_id), check(report_id<>related_id)
);
create index support_links_related on public.support_links(related_id);
alter table public.support_reports enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_links enable row level security;
revoke all on public.support_reports,public.support_messages,public.support_links from anon,authenticated;
grant select,insert,update,delete on public.support_reports,public.support_messages,public.support_links to service_role;
grant usage,select on sequence public.support_reports_number_seq to service_role;

-- Credentials are random, hashed at rest, and scope only support operations.
create function public.support_start(p_business uuid default null,p_context jsonb default '{}') returns text
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b uuid; own boolean; code text;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select exists(select 1 from public.system_owners where user_id=u and is_active) into own;
 if not own then
  select business_id into b from public.business_users where user_id=u and is_active and (p_business is null or business_id=p_business) order by created_at limit 1;
  if b is null then raise exception 'No active client membership' using errcode='42501'; end if;
 else b:=p_business; end if;
 if length(p_context::text)>2048 then raise exception 'Context too large'; end if;
 delete from support_private.sessions where expires_at<now();
 if (select count(*) from support_private.sessions where user_id=u and kind='handoff' and created_at>now()-interval '1 minute')>=10 then raise exception 'Try again shortly'; end if;
 code:=encode(extensions.gen_random_bytes(32),'hex');
 insert into support_private.sessions(token_hash,user_id,business_id,owner,kind,expires_at,context) values(encode(extensions.digest(code,'sha256'),'hex'),u,b,own,'handoff',now()+interval '60 seconds',p_context);
 return code;
end $$;
revoke all on function public.support_start(uuid,jsonb) from public,anon;
grant execute on function public.support_start(uuid,jsonb) to authenticated;

create function public.support_exchange(p_code text) returns text language plpgsql security definer set search_path='' as $$
declare s support_private.sessions; token text;
begin
 if p_code is null or p_code !~ '^[a-f0-9]{64}$' then raise exception 'Invalid or expired link' using errcode='42501'; end if;
 delete from support_private.sessions where token_hash=encode(extensions.digest(p_code,'sha256'),'hex') and kind='handoff' and expires_at>now() returning * into s;
 if s.user_id is null then raise exception 'Invalid or expired link' using errcode='42501'; end if;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 insert into support_private.sessions(token_hash,user_id,business_id,owner,kind,expires_at,context) values(encode(extensions.digest(token,'sha256'),'hex'),s.user_id,s.business_id,s.owner,'session',now()+interval '8 hours',s.context);
 return token;
end $$;
revoke all on function public.support_exchange(text) from public;
grant execute on function public.support_exchange(text) to anon,authenticated;

create function public.support_call(p_session text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s support_private.sessions; r public.support_reports; output jsonb; rid uuid; uid uuid; title_value text; desc_value text; phone_value text;
begin
 if p_session is null or p_session !~ '^[a-f0-9]{64}$' then raise exception 'Session expired' using errcode='42501'; end if;
 select * into s from support_private.sessions where token_hash=encode(extensions.digest(p_session,'sha256'),'hex') and kind='session' and expires_at>now();
 if s.user_id is null then raise exception 'Session expired' using errcode='42501'; end if;
 if s.owner then
  if not exists(select 1 from public.system_owners where user_id=s.user_id and is_active) then raise exception 'Access revoked' using errcode='42501'; end if;
 else
  if not exists(select 1 from public.business_users where user_id=s.user_id and business_id=s.business_id and is_active) then raise exception 'Access revoked' using errcode='42501'; end if;
 end if;
 if length(p_data::text)>50000 then raise exception 'Request too large'; end if;
 if p_action='logout' then delete from support_private.sessions where token_hash=s.token_hash; return '{}'; end if;
 if p_action='context' then
  return jsonb_build_object('app','QueueDrop','business_id',s.business_id,'owner',s.owner,'user_id',s.user_id,'name',(select full_name from public.profiles where id=s.user_id),'phone',(select phone from public.profiles where id=s.user_id),'business',(select name from public.businesses where id=s.business_id));
 end if;
 if p_action='list' then
  select coalesce(jsonb_agg(x),'[]') into output from (select id,number,title,status,created_at,updated_at,resolution,resolved_at from public.support_reports where (s.owner or business_id=s.business_id) and (coalesce(p_data->>'status','')='' or status=p_data->>'status') order by created_at desc limit 50 offset greatest(0,least(coalesce((p_data->>'offset')::int,0),100000))) x;
  return output;
 end if;
 if p_action='create' then
  if s.owner or s.business_id is null then raise exception 'Open support from a client workspace'; end if;
  perform pg_advisory_xact_lock(hashtext(s.user_id::text));
  if (select count(*) from public.support_reports where reporter_id=s.user_id and created_at>now()-interval '1 hour')>=20 then raise exception 'Report limit reached. Please try later.'; end if;
  title_value:=btrim(p_data->>'title'); desc_value:=btrim(p_data->>'description'); phone_value:=btrim(p_data->>'contact_number');
  if title_value is null or length(title_value) not between 3 and 160 or desc_value is null or length(desc_value) not between 10 and 10000 or phone_value is null or phone_value !~ '^\+?[0-9 ()-]{7,25}$' then raise exception 'Check title, description and contact number'; end if;
  insert into public.support_reports(business_id,reporter_id,title,description,contact_number,context) values(s.business_id,s.user_id,title_value,desc_value,phone_value,s.context) returning * into r;
  return jsonb_build_object('id',r.id,'number',r.number,'status',r.status);
 end if;
 rid:=(p_data->>'id')::uuid;
 select * into r from public.support_reports where id=rid for update;
 if r.id is null or not(s.owner or r.business_id=s.business_id) then raise exception 'Report unavailable' using errcode='42501'; end if;
 if p_action='detail' then
  output:=to_jsonb(r);
  if not s.owner then output:=output-'evidence'-'recommendation'-'clarification'-'tested_version'-'context'-'reporter_id'; end if;
  output:=output||jsonb_build_object('messages',(select coalesce(jsonb_agg(m order by m.created_at),'[]') from public.support_messages m where report_id=rid));
  if s.owner then
   output:=output||jsonb_build_object('business',(select name from public.businesses where id=r.business_id),'related',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'number',q.number,'title',q.title,'kind',l.kind)),'[]') from public.support_links l join public.support_reports q on q.id=case when l.report_id=rid then l.related_id else l.report_id end where l.report_id=rid or l.related_id=rid));
  else output:=output||jsonb_build_object('known_issue',exists(select 1 from public.support_links where (report_id=rid or related_id=rid) and kind='confirmed')); end if;
  return output;
 end if;
 if p_action='reply' then
  if length(btrim(coalesce(p_data->>'body',''))) not between 1 and 10000 then raise exception 'Enter a reply'; end if;
  insert into public.support_messages(report_id,author_id,body) values(rid,s.user_id,btrim(p_data->>'body'));
  update public.support_reports set updated_at=now() where id=rid; return '{}';
 end if;
 if p_action='reopen' then
  if r.status<>'resolved' or r.resolved_at<now()-interval '30 days' then raise exception 'Reopening is unavailable. Please create a new report.'; end if;
  update public.support_reports set status='received',approval='pending',resolved_at=null,updated_at=now() where id=rid; return '{}';
 end if;
 if not s.owner then raise exception 'Owner access required' using errcode='42501'; end if;
 if p_action='link' then
  if not exists(select 1 from public.support_reports where id=(p_data->>'related_id')::uuid and app_id=r.app_id) then raise exception 'Related report unavailable'; end if;
  insert into public.support_links values(rid,(p_data->>'related_id')::uuid,p_data->>'kind') on conflict(report_id,related_id) do update set kind=excluded.kind; return '{}';
 end if;
 if p_action='review' then
  if coalesce(p_data->>'status',r.status)='resolved' and (length(btrim(coalesce(p_data->>'resolution',r.resolution)))=0 or length(btrim(coalesce(p_data->>'evidence',r.evidence)))=0 or length(btrim(coalesce(p_data->>'tested_version',r.tested_version)))=0) then raise exception 'Resolution, verification evidence and tested version are required'; end if;
  if coalesce(p_data->>'status',r.status)='in_progress' and coalesce(p_data->>'approval',r.approval)<>'approved' then raise exception 'Approval required before fixing'; end if;
  update public.support_reports set status=coalesce(p_data->>'status',status),evaluation=coalesce(p_data->>'evaluation',evaluation),replication=coalesce(p_data->>'replication',replication),severity=coalesce(p_data->>'severity',severity),urgency=coalesce(p_data->>'urgency',urgency),approval=coalesce(p_data->>'approval',approval),clarification=coalesce(p_data->>'clarification',clarification),recommendation=coalesce(p_data->>'recommendation',recommendation),evidence=coalesce(p_data->>'evidence',evidence),tested_version=coalesce(p_data->>'tested_version',tested_version),resolution=coalesce(p_data->>'resolution',resolution),resolved_at=case when p_data->>'status'='resolved' then coalesce(resolved_at,now()) else resolved_at end,updated_at=now() where id=rid;
  if p_data->>'status'='resolved' and r.status<>'resolved' then insert into public.support_messages(report_id,author_id,body) values(rid,s.user_id,'Your issue has been resolved: '||(p_data->>'resolution')); end if;
  return '{}';
 end if;
 raise exception 'Unsupported action';
end $$;
revoke all on function public.support_call(text,text,jsonb) from public;
grant execute on function public.support_call(text,text,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
