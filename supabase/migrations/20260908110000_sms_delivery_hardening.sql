-- QueueDrop SMS delivery hardening.
-- Adds durable retries/attempt metadata and normalizes stub SMS opt-in.

alter table public.notifications
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists last_error text,
  add column if not exists provider_message_id text;

alter table public.notifications
  drop constraint if exists notifications_attempt_count_check;
alter table public.notifications
  add constraint notifications_attempt_count_check check (attempt_count >= 0 and attempt_count <= 100);

create index if not exists notifications_sms_dispatch_idx
  on public.notifications(status, next_attempt_at, created_at)
  where channel = 'sms';

create index if not exists notifications_sms_processing_idx
  on public.notifications(processing_started_at)
  where channel = 'sms' and status = 'processing';

alter table public.tickets
  add column if not exists sms_opted_in_at timestamptz;

-- Store SMS recipients as provider-friendly E.164-style digits (without +).
-- The application converts local numbers using the selected country code.
create or replace function public.set_stub_sms_number(
  target_session_token uuid,
  target_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ticket public.tickets%rowtype;
  v_phone text;
begin
  v_phone := regexp_replace(coalesce(target_phone, ''), '[^0-9]', '', 'g');

  if length(v_phone) < 8 or length(v_phone) > 15 or v_phone ~ '^0' then
    raise exception 'Mobile number must include a valid country code';
  end if;

  select t.*
    into v_ticket
  from public.customer_sessions cs
  join public.tickets t on t.customer_session_id = cs.id
  where cs.session_token = target_session_token
    and cs.expires_at > now()
  order by t.created_at desc
  limit 1;

  if v_ticket.id is null then
    raise exception 'Queue stub is not available';
  end if;

  if v_ticket.status not in ('waiting', 'called') then
    raise exception 'SMS notification can no longer be changed for this stub';
  end if;

  update public.tickets
  set sms_phone = v_phone,
      sms_opted_in_at = coalesce(sms_opted_in_at, now()),
      updated_at = now()
  where id = v_ticket.id;

  -- If the customer enables SMS while already inside the configured threshold,
  -- create the appropriate outbox job immediately. The server action then
  -- dispatches pending jobs after the response is committed.
  perform public.enqueue_branch_position_notifications(v_ticket.branch_id);

  return public.get_stub_ticket_status(target_session_token);
end;
$$;

revoke all on function public.set_stub_sms_number(uuid, text) from public;
grant execute on function public.set_stub_sms_number(uuid, text) to anon, authenticated, service_role;

-- Keep one routing rule per scope to prevent ambiguous delivery selection.
-- Older builds allowed duplicates, so remove older duplicates before adding
-- partial unique indexes.
delete from public.sms_routing_rules older
using public.sms_routing_rules newer
where older.id <> newer.id
  and older.scope_type = newer.scope_type
  and (
    (older.scope_type = 'country' and older.country_code = newer.country_code)
    or (older.scope_type = 'business' and older.business_id = newer.business_id)
    or (older.scope_type = 'branch' and older.branch_id = newer.branch_id)
  )
  and older.created_at < newer.created_at;

create unique index if not exists sms_routing_rules_country_uq
  on public.sms_routing_rules(country_code)
  where scope_type = 'country' and country_code is not null;

create unique index if not exists sms_routing_rules_business_uq
  on public.sms_routing_rules(business_id)
  where scope_type = 'business' and business_id is not null;

create unique index if not exists sms_routing_rules_branch_uq
  on public.sms_routing_rules(branch_id)
  where scope_type = 'branch' and branch_id is not null;

-- Ensure Semaphore uses its current endpoint while keeping the secret itself
-- outside the database.
update public.sms_delivery_methods
set api_base_url = coalesce(nullif(api_base_url, ''), 'https://api.semaphore.co/api/v4/messages'),
    secret_env_key = coalesce(nullif(secret_env_key, ''), 'SEMAPHORE_API_KEY'),
    updated_at = now()
where lower(coalesce(provider_code, '')) = 'semaphore';
