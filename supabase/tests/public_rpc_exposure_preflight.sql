-- Read-only security regression audit for public SECURITY DEFINER RPC exposure.
-- Run on TEST and PROD; any unexpected anon-callable definer is a release blocker.
WITH allowed(name) AS (VALUES
 ('claim_next_print_job'),('complete_print_job'),('complete_print_job_attempt'),
 ('get_stub_terminal'),('get_stub_ticket_status'),('issue_browser_queue_ticket'),
 ('issue_stub_ticket'),('issue_stub_ticket_for_service'),('issue_stub_ticket_request'),
 ('mark_stub_ticket_printed'),('print_job_retry_allowed'),('set_stub_sms_number'),
 ('support_call'),('support_exchange'),('support_return_path')
), exposed AS (
 SELECT p.proname AS name,pg_get_function_identity_arguments(p.oid) AS args
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosecdef AND has_function_privilege('anon',p.oid,'EXECUTE')
)
SELECT 'unexpected_anon_security_definer_rpc' AS check_name,
 CASE WHEN count(*)=0 THEN 'PASS' ELSE 'FAIL' END AS result,
 coalesce(jsonb_agg(jsonb_build_object('name',e.name,'args',e.args)) FILTER (WHERE e.name IS NOT NULL),'[]'::jsonb) AS details
FROM exposed e LEFT JOIN allowed a ON a.name=e.name WHERE a.name IS NULL
UNION ALL
SELECT 'missing_expected_anon_security_definer_rpc',
 CASE WHEN count(*)=0 THEN 'PASS' ELSE 'REVIEW' END,
 coalesce(jsonb_agg(a.name) FILTER (WHERE a.name IS NOT NULL),'[]'::jsonb)
FROM allowed a LEFT JOIN exposed e ON e.name=a.name WHERE e.name IS NULL;
