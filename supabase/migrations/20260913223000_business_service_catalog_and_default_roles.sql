-- Business-wide service catalog. Services may exist before being assigned to a branch.
create table if not exists public.business_services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  service_group text,
  description text,
  queue_prefix text,
  estimated_minutes integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_services_name_len check (char_length(btrim(name)) between 2 and 120),
  constraint business_services_minutes check (estimated_minutes is null or estimated_minutes between 1 and 480)
);
create unique index if not exists business_services_business_name_key on public.business_services(business_id, lower(name));
create index if not exists business_services_business_group_idx on public.business_services(business_id, service_group, created_at);
alter table public.business_services enable row level security;
drop policy if exists business_services_member_read on public.business_services;
create policy business_services_member_read on public.business_services for select using (public.is_business_member(business_id));
drop policy if exists business_services_admin_write on public.business_services;
create policy business_services_admin_write on public.business_services for all using (public.is_business_admin(business_id)) with check (public.is_business_admin(business_id));

create table if not exists public.branch_service_catalog (
  business_service_id uuid not null references public.business_services(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (business_service_id, branch_id)
);
alter table public.branch_service_catalog enable row level security;
drop policy if exists branch_service_catalog_member_read on public.branch_service_catalog;
create policy branch_service_catalog_member_read on public.branch_service_catalog for select using (public.is_branch_member(branch_id));
drop policy if exists branch_service_catalog_admin_write on public.branch_service_catalog;
create policy branch_service_catalog_admin_write on public.branch_service_catalog for all using (
  exists(select 1 from public.branches b where b.id=branch_id and public.is_business_admin(b.business_id))
) with check (
  exists(select 1 from public.branches b where b.id=branch_id and public.is_business_admin(b.business_id))
);

-- Backfill catalog from existing branch services without changing queue history.
insert into public.business_services(business_id,name,description,queue_prefix,estimated_minutes,is_active)
select b.business_id, s.name, max(s.description), max(s.queue_prefix), max(s.estimated_minutes), bool_or(s.is_active)
from public.services s join public.branches b on b.id=s.branch_id
group by b.business_id, s.name
on conflict (business_id, lower(name)) do nothing;

insert into public.branch_service_catalog(business_service_id,branch_id,service_id)
select bs.id,s.branch_id,s.id
from public.services s join public.branches b on b.id=s.branch_id
join public.business_services bs on bs.business_id=b.business_id and lower(bs.name)=lower(s.name)
where s.is_active=true
on conflict (business_service_id,branch_id) do update set service_id=excluded.service_id;

-- Every newly created client gets clear Admin and Staff default roles.
create or replace function public.seed_default_business_roles()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
  values
    (new.id,'Admin','Business administrator with broad operational access.','admin','all_branches',true,true),
    (new.id,'Staff','Basic branch queue operations role.','staff','own_branch_only',true,false)
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists seed_default_business_roles_trigger on public.businesses;
create trigger seed_default_business_roles_trigger after insert on public.businesses for each row execute function public.seed_default_business_roles();

-- Normalize the old default Administrator label to Admin where safe.
update public.roles r set name='Admin'
where r.is_system=true and r.base_role='admin' and lower(r.name)='administrator'
and not exists(select 1 from public.roles x where x.business_id=r.business_id and lower(x.name)='admin' and x.id<>r.id);

-- Ensure existing clients also have clean Admin and Staff defaults.
update public.roles set is_system=true, is_protected=true where lower(name)='admin' and base_role='admin';
update public.roles set is_system=true where lower(name)='staff' and base_role='staff';
insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
select b.id,'Admin','Business administrator with broad operational access.','admin','all_branches',true,true from public.businesses b
where not exists(select 1 from public.roles r where r.business_id=b.id and lower(r.name)='admin')
on conflict do nothing;
insert into public.roles(business_id,name,description,base_role,branch_scope,is_system,is_protected)
select b.id,'Staff','Basic branch queue operations role.','staff','own_branch_only',true,false from public.businesses b
where not exists(select 1 from public.roles r where r.business_id=b.id and lower(r.name)='staff')
on conflict do nothing;
