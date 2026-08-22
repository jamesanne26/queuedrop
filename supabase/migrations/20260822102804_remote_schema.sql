set local check_function_bodies = off;

revoke all on function "public"."validate_audit_log_user_business"() from "anon";

revoke all on function "public"."validate_audit_log_user_business"() from "authenticated";

revoke all on function "public"."validate_audit_log_user_business"() from "service_role";

revoke all on function "public"."validate_customer_session_business"() from "anon";

revoke all on function "public"."validate_customer_session_business"() from "authenticated";

revoke all on function "public"."validate_customer_session_business"() from "service_role";

revoke all on function "public"."validate_notification_relationships"() from "anon";

revoke all on function "public"."validate_notification_relationships"() from "authenticated";

revoke all on function "public"."validate_notification_relationships"() from "service_role";

revoke all on function "public"."validate_ticket_branch_consistency"() from "anon";

revoke all on function "public"."validate_ticket_branch_consistency"() from "authenticated";

revoke all on function "public"."validate_ticket_branch_consistency"() from "service_role";

revoke all on function "public"."validate_ticket_customer_business"() from "anon";

revoke all on function "public"."validate_ticket_customer_business"() from "authenticated";

revoke all on function "public"."validate_ticket_customer_business"() from "service_role";

revoke all on function "public"."validate_ticket_customer_session"() from "anon";

revoke all on function "public"."validate_ticket_customer_session"() from "authenticated";

revoke all on function "public"."validate_ticket_customer_session"() from "service_role";

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
  AS $function$
begin
  insert into public.profiles (
    id,
    full_name,
    phone
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );

  return new;
end;
$function$;

create or replace function public.is_branch_member (
  target_branch_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.branch_users bu
    where bu.branch_id = target_branch_id
      and bu.user_id = auth.uid()
  );
$function$;

create or replace function public.is_business_admin (
  target_business_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = auth.uid()
      and bu.role in ('owner', 'admin')
  );
$function$;

create or replace function public.is_business_member (
  target_business_id uuid
)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public'
  AS $function$
  select exists (
    select 1
    from public.business_users bu
    where bu.business_id = target_business_id
      and bu.user_id = auth.uid()
  );
$function$;

create or replace function public.set_updated_at()
  returns trigger
  language plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.validate_audit_log_user_business()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.business_users bu
    WHERE bu.business_id = NEW.business_id
      AND bu.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION
      'Audit log user does not belong to the specified business';
  END IF;

  RETURN NEW;
END;
$function$;

create or replace function public.validate_customer_session_business()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
DECLARE
  v_branch_business_id uuid;
  v_customer_business_id uuid;
BEGIN
  -- Anonymous/customer-less session is allowed.
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT business_id
  INTO v_branch_business_id
  FROM public.branches
  WHERE id = NEW.branch_id;

  SELECT business_id
  INTO v_customer_business_id
  FROM public.customers
  WHERE id = NEW.customer_id;

  IF v_branch_business_id IS NULL THEN
    RAISE EXCEPTION 'Invalid branch_id';
  END IF;

  IF v_customer_business_id IS NULL THEN
    RAISE EXCEPTION 'Invalid customer_id';
  END IF;

  IF v_branch_business_id <> v_customer_business_id THEN
    RAISE EXCEPTION
      'Customer session customer does not belong to the same business as the branch';
  END IF;

  RETURN NEW;
END;
$function$;

create or replace function public.validate_notification_relationships()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
DECLARE
  v_customer_business_id uuid;
  v_ticket_business_id uuid;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT business_id
    INTO v_customer_business_id
    FROM public.customers
    WHERE id = NEW.customer_id;

    IF v_customer_business_id IS NULL THEN
      RAISE EXCEPTION 'Invalid customer_id';
    END IF;

    IF v_customer_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'Notification customer does not belong to the same business';
    END IF;
  END IF;

  IF NEW.ticket_id IS NOT NULL THEN
    SELECT b.business_id
    INTO v_ticket_business_id
    FROM public.tickets t
    JOIN public.branches b
      ON b.id = t.branch_id
    WHERE t.id = NEW.ticket_id;

    IF v_ticket_business_id IS NULL THEN
      RAISE EXCEPTION 'Invalid ticket_id';
    END IF;

    IF v_ticket_business_id <> NEW.business_id THEN
      RAISE EXCEPTION 'Notification ticket does not belong to the same business';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

create or replace function public.validate_ticket_branch_consistency()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
declare
  v_queue_branch_id uuid;
  v_service_branch_id uuid;
begin
  select branch_id
  into v_queue_branch_id
  from public.queue_sessions
  where id = new.queue_session_id;

  select branch_id
  into v_service_branch_id
  from public.services
  where id = new.service_id;

  if v_queue_branch_id is null then
    raise exception 'Invalid queue_session_id';
  end if;

  if v_service_branch_id is null then
    raise exception 'Invalid service_id';
  end if;

  if new.branch_id <> v_queue_branch_id then
    raise exception 'Ticket branch does not match queue session branch';
  end if;

  if new.branch_id <> v_service_branch_id then
    raise exception 'Ticket branch does not match service branch';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_ticket_customer_business()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
declare
  v_branch_business_id uuid;
  v_customer_business_id uuid;
begin
  if new.customer_id is null then
    return new;
  end if;

  select business_id
  into v_branch_business_id
  from public.branches
  where id = new.branch_id;

  select business_id
  into v_customer_business_id
  from public.customers
  where id = new.customer_id;

  if v_branch_business_id is null then
    raise exception 'Invalid branch_id';
  end if;

  if v_customer_business_id is null then
    raise exception 'Invalid customer_id';
  end if;

  if v_branch_business_id <> v_customer_business_id then
    raise exception 'Ticket customer does not belong to the same business as the branch';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_ticket_customer_session()
  returns trigger
  language plpgsql
  set search_path to 'public'
  AS $function$
declare
  v_session_branch_id uuid;
  v_session_customer_id uuid;
begin
  if new.customer_session_id is null then
    return new;
  end if;

  select branch_id, customer_id
  into v_session_branch_id, v_session_customer_id
  from public.customer_sessions
  where id = new.customer_session_id;

  if v_session_branch_id is null then
    raise exception 'Invalid customer_session_id';
  end if;

  if v_session_branch_id <> new.branch_id then
    raise exception 'Ticket customer session does not belong to the same branch';
  end if;

  if new.customer_id is not null
     and v_session_customer_id is not null
     and v_session_customer_id <> new.customer_id then
    raise exception 'Ticket customer does not match customer session customer';
  end if;

  return new;
end;
$function$;

revoke all on function "public"."validate_audit_log_user_business"() from public;

revoke all on function "public"."validate_customer_session_business"() from public;

revoke all on function "public"."validate_notification_relationships"() from public;

revoke all on function "public"."validate_ticket_branch_consistency"() from public;

revoke all on function "public"."validate_ticket_customer_business"() from public;

revoke all on function "public"."validate_ticket_customer_session"() from public;

