-- Align the production support return-path validation with TEST.
-- Safe to reapply; changes only this function, not session/customer data.
CREATE OR REPLACE FUNCTION public.support_return_path(p_session text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  source text;
BEGIN
  PERFORM public.support_call(p_session, 'context', '{}'::jsonb);
  SELECT s.context->>'source_page' INTO source
  FROM support_private.sessions s
  WHERE s.token_hash = encode(extensions.digest(p_session, 'sha256'), 'hex');
  IF source IS NULL
     OR length(source) > 500
     OR source !~ '^/(dashboard|system)(/[a-zA-Z0-9_-]+)*$' THEN
    RETURN '/dashboard';
  END IF;
  RETURN source;
END;
$function$;
