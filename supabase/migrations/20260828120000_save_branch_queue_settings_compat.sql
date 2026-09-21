set local check_function_bodies = off;

-- Backward-compatible overload for the previous Settings deployment.
-- During a rolling deploy, older code calls save_branch_queue_settings without
-- target_ticket_prefix. Preserve the current prefix and delegate to the repaired
-- 16-argument implementation so Settings saves do not fail with a PostgREST
-- "function not found in schema cache" error.
create or replace function public.save_branch_queue_settings(
  target_branch_id uuid,
  target_starting_number integer,
  target_no_show_minutes integer,
  target_timezone text,
  target_allow_qr_join boolean,
  target_is_active boolean,
  target_show_branch_contact boolean,
  target_customer_can_edit_name boolean,
  target_customer_can_edit_mobile boolean,
  target_staff_can_edit_name boolean,
  target_staff_can_edit_mobile boolean,
  target_manager_can_edit_name boolean,
  target_manager_can_edit_mobile boolean,
  target_hours jsonb,
  target_position_rules jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ticket_prefix text;
begin
  select coalesce(qc.ticket_prefix, 'Q')
    into v_ticket_prefix
  from public.queue_configurations qc
  where qc.branch_id = target_branch_id;

  v_ticket_prefix := coalesce(v_ticket_prefix, 'Q');

  perform public.save_branch_queue_settings(
    target_branch_id,
    v_ticket_prefix,
    target_starting_number,
    target_no_show_minutes,
    target_timezone,
    target_allow_qr_join,
    target_is_active,
    target_show_branch_contact,
    target_customer_can_edit_name,
    target_customer_can_edit_mobile,
    target_staff_can_edit_name,
    target_staff_can_edit_mobile,
    target_manager_can_edit_name,
    target_manager_can_edit_mobile,
    target_hours,
    target_position_rules
  );
end;
$$;

revoke all on function public.save_branch_queue_settings(
  uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,jsonb,jsonb
) from public, anon, service_role;

grant execute on function public.save_branch_queue_settings(
  uuid,integer,integer,text,boolean,boolean,boolean,boolean,boolean,
  boolean,boolean,boolean,boolean,jsonb,jsonb
) to authenticated;

notify pgrst, 'reload schema';
