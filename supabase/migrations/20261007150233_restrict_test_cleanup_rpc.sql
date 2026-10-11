-- This legacy helper exists only on some Test databases. It is never a client API.
do $$ begin
  if to_regprocedure('public.delete_test_user_by_email(text)') is not null then
    revoke all on function public.delete_test_user_by_email(text) from public,anon,authenticated;
    grant execute on function public.delete_test_user_by_email(text) to service_role;
  end if;
end $$;
notify pgrst, 'reload schema';
