-- DISPOSABLE LOCAL DATABASE ONLY. Reproduces only the five audited gaps.
-- This fixture is not a Production backup or full Production schema clone.
DROP FUNCTION public.finalize_paymongo_checkout_atomic(uuid,text,numeric,text,timestamptz,text,jsonb);
DROP FUNCTION public.finalize_paymongo_invoice_atomic(text,text,text,numeric,text,timestamptz,jsonb);
DROP INDEX public.payments_paymongo_invoice_unique_all;
DROP INDEX public.payments_paymongo_invoice_reference_unique;
CREATE OR REPLACE FUNCTION public.support_return_path(p_session text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_context jsonb;
  v_path text;
begin
  perform public.support_call(p_session, 'context', '{}'::jsonb);
  select s.context into v_context
  from support_private.sessions s
  where s.token_hash = encode(extensions.digest(p_session, 'sha256'), 'hex');
  v_path := v_context->>'source_page';
  if v_path ~ '^/(dashboard|system)(/[a-zA-Z0-9_-]+)*$' then
    return v_path;
  end if;
  return '/dashboard';
end;
$function$
;
