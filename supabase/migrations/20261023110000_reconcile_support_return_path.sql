-- Forward-only reconciliation: align the effective TEST support return-path RPC
-- with the canonical source implementation without editing migration history.
-- Only same-origin dashboard/system paths are accepted; the token is hashed.
begin;
create or replace function public.support_return_path(p_session text)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  source text;
begin
  perform public.support_call(p_session, 'context', '{}'::jsonb);
  select s.context->>'source_page' into source
  from support_private.sessions s
  where s.token_hash = encode(extensions.digest(p_session, 'sha256'), 'hex');
  if source is null
     or length(source) > 500
     or source !~ '^/(dashboard|system)(/[a-zA-Z0-9_-]+)*$' then
    return '/dashboard';
  end if;
  return source;
end;
$function$;
revoke all on function public.support_return_path(text) from public, anon, authenticated, service_role;
grant execute on function public.support_return_path(text) to anon, authenticated, service_role;
commit;
notify pgrst, 'reload schema';
