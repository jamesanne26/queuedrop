-- Repair the public queue RPC used by the QR/customer entry page and E2E tests.
-- This migration is intentionally self-contained so TEST environments with
-- migration/schema drift recover the public.get_public_branch_queue RPC.

set local check_function_bodies = off;
create or replace function public.get_public_branch_queue(
  target_business_slug text,
  target_branch_slug text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_branch_id uuid;
  v_open boolean;
begin
  select
    br.id,
    jsonb_build_object(
      'business', jsonb_build_object(
        'name', b.name,
        'slug', b.slug
      ),
      'branch', jsonb_build_object(
        'id', br.id,
        'name', br.name,
        'slug', br.slug,
        'address', br.address,
        'phone', case when qc.show_branch_contact then br.phone else null end,
        'timezone', br.timezone
      ),
      'services', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', s.id,
            'name', s.name,
            'description', s.description,
            'queue_prefix', coalesce(s.queue_prefix, qc.ticket_prefix),
            'estimated_minutes', s.estimated_minutes
          ) order by s.created_at
        )
        from public.services s
        where s.branch_id = br.id
          and s.is_active = true
      ), '[]'::jsonb)
    )
  into v_branch_id, v_result
  from public.businesses b
  join public.branches br on br.business_id = b.id
  join public.queue_configurations qc on qc.branch_id = br.id
  where b.slug = lower(btrim(target_business_slug))
    and br.slug = lower(btrim(target_branch_slug))
    and b.status = 'active'
    and br.status = 'active'
    and qc.is_active = true
    and qc.allow_qr_join = true
  limit 1;

  if v_branch_id is null or v_result is null then
    return null;
  end if;

  v_open := public.is_branch_open_now(v_branch_id);

  return v_result || jsonb_build_object(
    'queue_open', v_open,
    'queue_status_message',
      case when v_open then 'Open for joining' else 'Branch is currently closed' end
  );
end;
$$;
revoke all on function public.get_public_branch_queue(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_branch_queue(text, text)
  to anon, authenticated, service_role;
-- Force PostgREST to refresh its function/schema cache after the repair.
notify pgrst, 'reload schema';
