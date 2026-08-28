create table if not exists public.position_notification_rules (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  position integer not null check (position >= 1 and position <= 9999),
  send_sms_once boolean not null default false,
  browser_notification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint position_notification_rules_branch_position_key
    unique (branch_id, position)
);

alter table public.position_notification_rules enable row level security;

create index if not exists idx_position_notification_rules_branch
  on public.position_notification_rules(branch_id, position);

drop trigger if exists set_position_notification_rules_updated_at
  on public.position_notification_rules;

create trigger set_position_notification_rules_updated_at
  before update on public.position_notification_rules
  for each row execute function public.set_updated_at();

drop policy if exists "Scoped members can view position notification rules"
  on public.position_notification_rules;

create policy "Scoped members can view position notification rules"
  on public.position_notification_rules
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      where b.id = position_notification_rules.branch_id
        and (
          public.is_business_admin(b.business_id)
          or public.is_branch_member(b.id)
        )
    )
  );

grant select on public.position_notification_rules to authenticated;
grant all on public.position_notification_rules to postgres, service_role;

notify pgrst, 'reload schema';
