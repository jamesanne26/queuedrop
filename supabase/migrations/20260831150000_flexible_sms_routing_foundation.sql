-- Flexible SMS routing foundation: cloud providers + owner/client/branch Android gateways.
create table if not exists public.sms_delivery_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  method_type text not null check (method_type in ('cloud_provider','system_android','branch_android')),
  provider_code text,
  country_code text not null default 'PH',
  is_enabled boolean not null default true,
  priority integer not null default 100 check (priority >= 1),
  api_base_url text,
  secret_env_key text,
  sender_name text,
  cost_per_sms numeric(12,4),
  currency text not null default 'PHP',
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sms_delivery_methods_name_country_uq
  on public.sms_delivery_methods(lower(name), country_code);

create table if not exists public.sms_gateway_devices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  owner_scope text not null check (owner_scope in ('system','business','branch')),
  name text not null,
  pairing_token_hash text,
  device_token_hash text,
  phone_number text,
  carrier text,
  country_code text not null default 'PH',
  status text not null default 'offline' check (status in ('pending','online','offline','disabled','revoked')),
  last_seen_at timestamptz,
  app_version text,
  battery_percent integer check (battery_percent is null or battery_percent between 0 and 100),
  signal_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_gateway_devices_branch_idx on public.sms_gateway_devices(branch_id);
create index if not exists sms_gateway_devices_business_idx on public.sms_gateway_devices(business_id);

create table if not exists public.sms_routing_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('system','country','business','branch')),
  country_code text,
  business_id uuid references public.businesses(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade,
  primary_method_id uuid references public.sms_delivery_methods(id) on delete set null,
  fallback_method_ids uuid[] not null default '{}',
  routing_policy text not null default 'manual_priority'
    check (routing_policy in ('manual_priority','branch_owned_first','cloud_only','android_only','cheapest','most_reliable')),
  is_enabled boolean not null default true,
  retry_limit integer not null default 2 check (retry_limit between 0 and 10),
  failover_after_seconds integer not null default 30 check (failover_after_seconds between 5 and 600),
  monthly_sms_limit integer,
  monthly_cost_limit numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sms_routing_rules_scope_idx
  on public.sms_routing_rules(scope_type, country_code, business_id, branch_id);

create table if not exists public.sms_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  method_id uuid references public.sms_delivery_methods(id) on delete set null,
  gateway_device_id uuid references public.sms_gateway_devices(id) on delete set null,
  attempt_number integer not null default 1,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','failed','expired')),
  provider_message_id text,
  error_message text,
  estimated_cost numeric(12,4),
  currency text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists sms_delivery_attempt_once_uq
  on public.sms_delivery_attempts(notification_id, method_id, gateway_device_id, attempt_number);

alter table public.sms_delivery_methods enable row level security;
alter table public.sms_gateway_devices enable row level security;
alter table public.sms_routing_rules enable row level security;
alter table public.sms_delivery_attempts enable row level security;

-- Service-role access is used by the System Owner server pages and notification worker.
-- Do not expose provider secrets in these tables; secret_env_key stores only the env-var name.

insert into public.sms_delivery_methods
  (name, method_type, provider_code, country_code, priority, secret_env_key, sender_name, currency, config)
values
  ('Semaphore', 'cloud_provider', 'semaphore', 'PH', 100, 'SEMAPHORE_API_KEY', 'QueueDrop', 'PHP',
   '{"supports_sender_name":true,"status":"available"}'::jsonb),
  ('System Owner Android Gateway', 'system_android', 'android_gateway', 'PH', 200, null, null, 'PHP',
   '{"requires_companion_app":true}'::jsonb),
  ('Branch Android Gateway', 'branch_android', 'android_gateway', 'PH', 300, null, null, 'PHP',
   '{"requires_companion_app":true}'::jsonb)
on conflict (lower(name), country_code) do nothing;
