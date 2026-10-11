create or replace function support_private.archive_eligible(rid uuid)
returns boolean
language sql
stable
set search_path = ''
as $function$
  select exists (
    select 1
    from public.support_reports r
    where r.id = rid
      and r.status in ('resolved', 'closed')
      and r.updated_at < now() - interval '30 days'
      and not exists (
        select 1 from support_private.attachments a where a.report_id = r.id
      )
      and not exists (
        select 1 from support_private.notifications delivery
        where delivery.report_id = r.id
          and delivery.state in ('pending', 'sending', 'failed')
      )
      and not exists (
        select 1
        from public.support_links l
        join public.support_reports q
          on q.id = case when l.report_id = r.id then l.related_id else l.report_id end
        where (l.report_id = r.id or l.related_id = r.id)
          and q.status not in ('resolved', 'closed')
      )
  );
$function$;