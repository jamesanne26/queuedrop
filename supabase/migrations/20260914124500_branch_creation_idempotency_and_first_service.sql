-- Prevent rapid/double branch submits from creating duplicate branch names and
-- provide an atomic first-service bootstrap for the onboarding wizard.

create or replace function public.create_branch_with_defaults(
  branch_name text,
  branch_address text default null,
  branch_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_business_id uuid;
  v_name text := btrim(branch_name);
  v_address text := nullif(btrim(branch_address), '');
  v_phone text := nullif(btrim(branch_phone), '');
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_branch_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  v_business_id := public.get_current_admin_business_id();
  if v_business_id is null then raise exception 'Business admin access required'; end if;

  -- Serialize branch creation per business so a double click/request cannot race
  -- past the duplicate-name check below.
  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':branch:create', 0));

  if not exists (select 1 from public.businesses b where b.id=v_business_id and b.status='active') then
    raise exception 'Business admin access required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Branch name must be between 2 and 120 characters'; end if;
  if v_address is not null and char_length(v_address) > 300 then raise exception 'Address must be 300 characters or fewer'; end if;
  if v_phone is not null and char_length(v_phone) > 20 then raise exception 'Phone must be 20 digits or fewer'; end if;
  if v_phone is not null and v_phone !~ '^[0-9]{7,20}$' then raise exception 'Phone must contain numbers only'; end if;

  if exists (select 1 from public.branches b where b.business_id=v_business_id and lower(btrim(b.name))=lower(v_name)) then
    raise exception using errcode='23505', message='A branch with that name already exists in this business.';
  end if;

  v_base_slug := trim(both '-' from regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'));
  if v_base_slug='' then v_base_slug:='branch'; end if;
  v_slug := left(v_base_slug,56);
  while exists(select 1 from public.branches b where b.business_id=v_business_id and b.slug=v_slug) loop
    v_suffix:=left(replace(gen_random_uuid()::text,'-',''),6);
    v_slug:=left(v_base_slug,49)||'-'||v_suffix;
  end loop;

  insert into public.branches(business_id,name,slug,address,phone)
  values(v_business_id,v_name,v_slug,v_address,v_phone)
  returning id into v_branch_id;

  insert into public.branch_users(branch_id,user_id) values(v_branch_id,v_user_id)
  on conflict(branch_id,user_id) do nothing;
  insert into public.queue_configurations(branch_id) values(v_branch_id);
  insert into public.audit_logs(business_id,user_id,action,entity_type,entity_id,details)
  values(v_business_id,v_user_id,'branch.created','branch',v_branch_id,jsonb_build_object('branch_name',v_name));
  return v_branch_id;
end;
$$;

revoke all on function public.create_branch_with_defaults(text,text,text) from public, anon, service_role;
grant execute on function public.create_branch_with_defaults(text,text,text) to authenticated;

create or replace function public.create_initial_branch_service(
  target_branch_id uuid,
  service_name text,
  service_group text default null,
  service_description text default null,
  service_queue_prefix text default null,
  service_estimated_minutes integer default null
)
returns table (business_service_id uuid, service_id uuid)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user_id uuid:=auth.uid();
  v_business_id uuid;
  v_name text:=btrim(service_name);
  v_group text:=nullif(btrim(service_group),'');
  v_description text:=nullif(btrim(service_description),'');
  v_prefix text:=nullif(upper(btrim(service_queue_prefix)),'');
  v_catalog_id uuid;
  v_service_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  select b.business_id into v_business_id from public.branches b
    where b.id=target_branch_id and b.status='active' and public.is_business_admin(b.business_id) limit 1;
  if v_business_id is null then raise exception 'Active branch with business admin access required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_business_id::text || ':service:create:' || target_branch_id::text,0));
  if char_length(v_name)<2 or char_length(v_name)>120 then raise exception 'Service name must be between 2 and 120 characters'; end if;
  if v_group is not null and char_length(v_group)>80 then raise exception 'Service group must be 80 characters or fewer'; end if;
  if v_description is not null and char_length(v_description)>500 then raise exception 'Description must be 500 characters or fewer'; end if;
  if v_prefix is not null and v_prefix !~ '^[A-Z0-9]{1,6}$' then raise exception 'Queue prefix must be 1-6 letters or numbers'; end if;
  if service_estimated_minutes is not null and (service_estimated_minutes<1 or service_estimated_minutes>480) then raise exception 'Estimated minutes must be between 1 and 480'; end if;

  if exists(select 1 from public.business_services bs where bs.business_id=v_business_id and lower(bs.name)=lower(v_name)) then
    raise exception using errcode='23505', message='A service with this name already exists.';
  end if;

  insert into public.business_services(business_id,name,service_group,description,queue_prefix,estimated_minutes)
  values(v_business_id,v_name,v_group,v_description,v_prefix,service_estimated_minutes)
  returning id into v_catalog_id;

  v_service_id := public.create_service_for_branch(target_branch_id,v_name,v_description,v_prefix,service_estimated_minutes);
  insert into public.branch_service_catalog(business_service_id,branch_id,service_id)
  values(v_catalog_id,target_branch_id,v_service_id);

  return query select v_catalog_id,v_service_id;
end;
$$;

revoke all on function public.create_initial_branch_service(uuid,text,text,text,text,integer) from public, anon, service_role;
grant execute on function public.create_initial_branch_service(uuid,text,text,text,text,integer) to authenticated;
