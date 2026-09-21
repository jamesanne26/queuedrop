-- Repair the customer move-down settings RPC and force PostgREST to reload its
-- schema cache. This migration is intentionally idempotent so environments
-- that already received the original feature migration are safe.

set local check_function_bodies = off;

alter table public.queue_configurations
  add column if not exists customer_can_move_down boolean not null default false;

create or replace function public.set_branch_customer_move_down_setting(
  target_branch_id uuid,
  target_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_business_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  if not public.can_manage_branch_settings(target_branch_id) then
    raise exception 'You do not have permission to manage this branch';
  end if;

  select b.business_id into v_business_id
  from public.branches b
  where b.id = target_branch_id;

  if v_business_id is null then
    raise exception 'Branch not found';
  end if;

  update public.queue_configurations
  set customer_can_move_down = coalesce(target_enabled, false),
      updated_at = now()
  where branch_id = target_branch_id;

  if not found then
    insert into public.queue_configurations (branch_id, customer_can_move_down)
    values (target_branch_id, coalesce(target_enabled, false));
  end if;

  insert into public.audit_logs (business_id, user_id, action, entity_type, entity_id, details)
  values (
    v_business_id,
    v_actor,
    'queue.customer_move_down_setting_updated',
    'branch',
    target_branch_id,
    jsonb_build_object('customer_can_move_down', coalesce(target_enabled, false))
  );
end;
$$;

revoke all on function public.set_branch_customer_move_down_setting(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.set_branch_customer_move_down_setting(uuid, boolean)
  to authenticated;

-- Supabase/PostgREST listens for this notification and rebuilds the API schema
-- cache, preventing PGRST202 after a newly deployed function migration.
select pg_notify('pgrst', 'reload schema');
