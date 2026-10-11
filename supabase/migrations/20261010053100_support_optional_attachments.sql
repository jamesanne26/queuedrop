create table if not exists support_private.attachments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.support_reports(id) on delete restrict,
  uploader_id uuid not null references auth.users(id),
  client_key uuid not null,
  name text not null check (length(name) between 1 and 160 and name !~ '[[:cntrl:]/\\\\]'),
  extension text not null check (extension in ('png','jpg','jpeg','txt','csv','pdf','xls','xlsx','docx')),
  type text not null,
  size integer not null check (size between 1 and 2097152),
  path text not null unique,
  state text not null default 'pending' check (state in ('pending','ready')),
  created_at timestamptz not null default now(),
  unique (report_id, client_key)
);
create index if not exists support_attachments_report on support_private.attachments(report_id,state);
create index if not exists support_attachments_uploader on support_private.attachments(uploader_id,created_at);
alter table support_private.attachments enable row level security;
revoke all on support_private.attachments from public, anon, authenticated;
grant all on support_private.attachments to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('support-attachments','support-attachments',false,2097152,
  array['image/png','image/jpeg','text/plain','text/csv','application/pdf','application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;
do $$
begin
  if not exists (
    select 1 from storage.buckets
    where id='support-attachments' and name='support-attachments' and public=false
      and file_size_limit=2097152
  ) then raise exception 'Support attachment bucket configuration is incompatible'; end if;
end $$;

create or replace function public.support_attachment_call(p_session text, p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  ctx jsonb;
  report public.support_reports;
  file support_private.attachments;
  rid uuid;
  aid uuid;
  ext text;
  mime text;
begin
  if p_data is null or jsonb_typeof(p_data)<>'object' or length(p_data::text)>2000 then
    raise exception 'Invalid attachment request';
  end if;

  -- Revalidate session expiry, active membership, system-owner status, and banned users.
  ctx:=public.support_call(p_session,'context','{}');
  if p_action in ('reserve','list') then
    rid:=(p_data->>'id')::uuid;
  else
    select * into file from support_private.attachments where id=(p_data->>'id')::uuid;
    rid:=file.report_id;
  end if;
  if rid is null then raise exception 'Attachment unavailable' using errcode='42501'; end if;
  perform public.support_call(p_session,'detail',jsonb_build_object('id',rid));
  select * into report from public.support_reports where id=rid;

  if p_action='list' then
    return (
      select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'size',size,'type',type,'created_at',created_at) order by created_at),'[]')
      from support_private.attachments where report_id=rid and state='ready'
    );
  end if;
  if p_action='download' then
    if file.state<>'ready' then raise exception 'Attachment unavailable' using errcode='42501'; end if;
    return jsonb_build_object('path',file.path,'name',file.name,'type',file.type,'extension',file.extension);
  end if;
  if (ctx->>'owner')::boolean or report.reporter_id<>(ctx->>'user_id')::uuid then
    raise exception 'Attachment access denied' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('support-attachment:'||rid::text));
  if p_action='reserve' then
    select * into file from support_private.attachments
    where report_id=rid and client_key=(p_data->>'client_key')::uuid;
    if file.id is not null then
      if file.name<>p_data->>'name' or file.size<>(p_data->>'size')::int or file.type<>p_data->>'type' then
        raise exception 'Attachment retry mismatch';
      end if;
      return jsonb_build_object('id',file.id,'path',file.path,'state',file.state);
    end if;
    if (select count(*) from support_private.attachments where report_id=rid)>=5 then
      raise exception 'Attach up to 5 files per report';
    end if;
    if (select count(*) from support_private.attachments where uploader_id=(ctx->>'user_id')::uuid and created_at>now()-interval '1 hour')>=50 then
      raise exception 'Attachment limit reached. Please try later.';
    end if;
    ext:=lower(p_data->>'extension');
    mime:=case ext
      when 'png' then 'image/png'
      when 'jpg' then 'image/jpeg'
      when 'jpeg' then 'image/jpeg'
      when 'txt' then 'text/plain'
      when 'csv' then 'text/csv'
      when 'pdf' then 'application/pdf'
      when 'xls' then 'application/vnd.ms-excel'
      when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    end;
    if mime is null or mime is distinct from p_data->>'type' or lower(p_data->>'name') not like '%.'||ext then
      raise exception 'Unsupported attachment format';
    end if;
    aid:=gen_random_uuid();
    insert into support_private.attachments(id,report_id,uploader_id,client_key,name,extension,type,size,path)
    values(aid,rid,(ctx->>'user_id')::uuid,(p_data->>'client_key')::uuid,p_data->>'name',ext,mime,(p_data->>'size')::int,rid::text||'/'||aid::text||'.'||ext)
    returning * into file;
    return jsonb_build_object('id',file.id,'path',file.path,'state',file.state);
  end if;
  if file.uploader_id<>(ctx->>'user_id')::uuid then raise exception 'Attachment access denied' using errcode='42501'; end if;
  if p_action='complete' then
    if not exists (
      select 1 from storage.objects
      where bucket_id='support-attachments' and name=file.path
        and (metadata->>'size')::bigint=file.size and metadata->>'mimetype'=file.type
    ) then raise exception 'Attachment upload is incomplete'; end if;
    update support_private.attachments set state='ready' where id=file.id;
    return jsonb_build_object('id',file.id,'state','ready');
  end if;
  if p_action='abort' then
    if file.state<>'pending' then raise exception 'Attachment already completed'; end if;
    delete from support_private.attachments where id=file.id;
    return jsonb_build_object('path',file.path);
  end if;
  raise exception 'Unsupported attachment action';
end
$function$;
revoke all on function public.support_attachment_call(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.support_attachment_call(text,text,jsonb) to service_role;
notify pgrst, 'reload schema';