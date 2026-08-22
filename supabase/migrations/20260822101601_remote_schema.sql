set local check_function_bodies = off;

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on sequences from "service_role";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "anon";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "authenticated";

alter default privileges for role "postgres" in schema "public" revoke all on tables from "service_role";

create table "public"."audit_logs" (
  "id"          uuid                     not null default gen_random_uuid(),
  "business_id" uuid                     not null,
  "user_id"     uuid,
  "action"      text                     not null,
  "entity_type" text,
  "entity_id"   uuid,
  "details"     jsonb,
  "created_at"  timestamp with time zone not null default now(),
  constraint "audit_logs_pkey" primary key (id)
);

alter table "public"."audit_logs"
  enable row level security;

create table "public"."branch_users" (
  "id"         uuid                     not null default gen_random_uuid(),
  "branch_id"  uuid                     not null,
  "user_id"    uuid                     not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "branch_users_branch_id_user_id_key" unique (branch_id, user_id),
  constraint "branch_users_pkey" primary key (id)
);

alter table "public"."branch_users"
  enable row level security;

create table "public"."branches" (
  "id"          uuid                     not null default gen_random_uuid(),
  "business_id" uuid                     not null,
  "name"        text                     not null,
  "slug"        text                     not null,
  "address"     text,
  "phone"       text,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "branches_business_id_slug_key" unique (business_id, slug),
  constraint "branches_pkey" primary key (id)
);

alter table "public"."branches"
  enable row level security;

create table "public"."business_subscriptions" (
  "id"          uuid                     not null default gen_random_uuid(),
  "business_id" uuid                     not null,
  "plan_id"     uuid                     not null,
  "status"      text                     not null default 'active'::text,
  "started_at"  timestamp with time zone not null default now(),
  "expires_at"  timestamp with time zone,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "business_subscriptions_business_id_key" unique (business_id),
  constraint "business_subscriptions_pkey" primary key (id),
  constraint "business_subscriptions_status_check" check ((status = ANY (ARRAY['trialing'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'expired'::text])))
);

alter table "public"."business_subscriptions"
  enable row level security;

create table "public"."business_users" (
  "id"          uuid                     not null default gen_random_uuid(),
  "business_id" uuid                     not null,
  "user_id"     uuid                     not null,
  "created_at"  timestamp with time zone not null default now(),
  constraint "business_users_business_id_user_id_key" unique (business_id, user_id),
  constraint "business_users_pkey" primary key (id)
);

alter table "public"."business_users"
  enable row level security;

create table "public"."businesses" (
  "id"         uuid                     not null default gen_random_uuid(),
  "name"       text                     not null,
  "slug"       text                     not null,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "businesses_pkey" primary key (id),
  constraint "businesses_slug_key" unique (slug)
);

alter table "public"."businesses"
  enable row level security;

create table "public"."customer_sessions" (
  "id"            uuid                     not null default gen_random_uuid(),
  "customer_id"   uuid,
  "branch_id"     uuid                     not null,
  "session_token" uuid                     not null default gen_random_uuid(),
  "expires_at"    timestamp with time zone not null,
  "created_at"    timestamp with time zone not null default now(),
  constraint "customer_sessions_pkey" primary key (id),
  constraint "customer_sessions_session_token_key" unique (session_token)
);

alter table "public"."customer_sessions"
  enable row level security;

create table "public"."customers" (
  "id"          uuid                     not null default gen_random_uuid(),
  "business_id" uuid                     not null,
  "phone"       text,
  "name"        text,
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now(),
  constraint "customers_pkey" primary key (id)
);

alter table "public"."customers"
  enable row level security;

create table "public"."devices" (
  "id"           uuid                     not null default gen_random_uuid(),
  "branch_id"    uuid                     not null,
  "name"         text                     not null,
  "device_type"  text                     not null,
  "device_token" uuid                     not null default gen_random_uuid(),
  "is_active"    boolean                  not null default true,
  "last_seen_at" timestamp with time zone,
  "created_at"   timestamp with time zone not null default now(),
  "updated_at"   timestamp with time zone not null default now(),
  constraint "devices_device_token_key" unique (device_token),
  constraint "devices_device_type_check" check ((device_type = ANY (ARRAY['kiosk'::text, 'staff'::text, 'display'::text]))),
  constraint "devices_pkey" primary key (id)
);

alter table "public"."devices"
  enable row level security;

create table "public"."notifications" (
  "id"                uuid                     not null default gen_random_uuid(),
  "business_id"       uuid                     not null,
  "customer_id"       uuid,
  "ticket_id"         uuid,
  "channel"           text                     not null,
  "notification_type" text                     not null,
  "recipient"         text,
  "message"           text                     not null,
  "status"            text                     not null default 'pending'::text,
  "sent_at"           timestamp with time zone,
  "created_at"        timestamp with time zone not null default now(),
  constraint "notifications_channel_check" check ((channel = ANY (ARRAY['sms'::text, 'email'::text, 'web'::text]))),
  constraint "notifications_pkey" primary key (id),
  constraint "notifications_status_check" check ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);

alter table "public"."notifications"
  enable row level security;

create table "public"."operating_hours" (
  "id"          uuid                     not null default gen_random_uuid(),
  "branch_id"   uuid                     not null,
  "day_of_week" smallint                 not null,
  "is_open"     boolean                  not null default true,
  "open_time"   time without time zone,
  "close_time"  time without time zone,
  "created_at"  timestamp with time zone not null default now(),
  constraint "operating_hours_branch_id_day_of_week_key" unique (branch_id, day_of_week),
  constraint "operating_hours_check" check ((((is_open = false) AND (open_time IS NULL) AND (close_time IS NULL)) OR ((is_open = true) AND (open_time IS
    NOT NULL) AND (close_time IS NOT NULL)))),
  constraint "operating_hours_day_of_week_check" check (((day_of_week >= 0) AND (day_of_week <= 6))),
  constraint "operating_hours_pkey" primary key (id)
);

alter table "public"."operating_hours"
  enable row level security;

create table "public"."plans" (
  "id"           uuid                     not null default gen_random_uuid(),
  "name"         text                     not null,
  "description"  text,
  "max_branches" integer,
  "max_users"    integer,
  "max_services" integer,
  "is_active"    boolean                  not null default true,
  "created_at"   timestamp with time zone not null default now(),
  "updated_at"   timestamp with time zone not null default now(),
  constraint "plans_name_key" unique (name),
  constraint "plans_pkey" primary key (id)
);

alter table "public"."plans"
  enable row level security;

create table "public"."profiles" (
  "id"         uuid                     not null,
  "full_name"  text,
  "phone"      text,
  "created_at" timestamp with time zone not null default now(),
  "updated_at" timestamp with time zone not null default now(),
  constraint "profiles_pkey" primary key (id)
);

alter table "public"."profiles"
  enable row level security;

create table "public"."queue_configurations" (
  "id"              uuid                     not null default gen_random_uuid(),
  "branch_id"       uuid                     not null,
  "ticket_prefix"   text                     not null default 'Q'::text,
  "starting_number" integer                  not null default 1,
  "no_show_minutes" integer                  not null default 5,
  "allow_qr_join"   boolean                  not null default true,
  "is_active"       boolean                  not null default true,
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  constraint "queue_configurations_branch_id_key" unique (branch_id),
  constraint "queue_configurations_no_show_minutes_check" check ((no_show_minutes >= 0)),
  constraint "queue_configurations_pkey" primary key (id),
  constraint "queue_configurations_starting_number_check" check ((starting_number > 0))
);

alter table "public"."queue_configurations"
  enable row level security;

create table "public"."queue_sessions" (
  "id"             uuid                     not null default gen_random_uuid(),
  "branch_id"      uuid                     not null,
  "session_date"   date                     not null,
  "status"         text                     not null default 'open'::text,
  "current_number" integer                  not null default 0,
  "opened_at"      timestamp with time zone,
  "closed_at"      timestamp with time zone,
  "created_at"     timestamp with time zone not null default now(),
  "updated_at"     timestamp with time zone not null default now(),
  constraint "queue_sessions_branch_id_session_date_key" unique (branch_id, session_date),
  constraint "queue_sessions_current_number_check" check ((current_number >= 0)),
  constraint "queue_sessions_pkey" primary key (id),
  constraint "queue_sessions_status_check" check ((status = ANY (ARRAY['open'::text, 'closed'::text])))
);

alter table "public"."queue_sessions"
  enable row level security;

create table "public"."services" (
  "id"                uuid                     not null default gen_random_uuid(),
  "branch_id"         uuid                     not null,
  "name"              text                     not null,
  "description"       text,
  "queue_prefix"      text,
  "estimated_minutes" integer,
  "is_active"         boolean                  not null default true,
  "created_at"        timestamp with time zone not null default now(),
  "updated_at"        timestamp with time zone not null default now(),
  constraint "services_branch_id_name_key" unique (branch_id, name),
  constraint "services_pkey" primary key (id)
);

alter table "public"."services"
  enable row level security;

create table "public"."ticket_events" (
  "id"           uuid                     not null default gen_random_uuid(),
  "ticket_id"    uuid                     not null,
  "performed_by" uuid,
  "notes"        text,
  "created_at"   timestamp with time zone not null default now(),
  constraint "ticket_events_pkey" primary key (id)
);

alter table "public"."ticket_events"
  enable row level security;

create table "public"."tickets" (
  "id"                  uuid                     not null default gen_random_uuid(),
  "queue_session_id"    uuid                     not null,
  "branch_id"           uuid                     not null,
  "service_id"          uuid                     not null,
  "customer_id"         uuid,
  "customer_session_id" uuid,
  "ticket_number"       integer                  not null,
  "display_number"      text                     not null,
  "joined_at"           timestamp with time zone not null default now(),
  "called_at"           timestamp with time zone,
  "serving_at"          timestamp with time zone,
  "completed_at"        timestamp with time zone,
  "cancelled_at"        timestamp with time zone,
  "created_at"          timestamp with time zone not null default now(),
  "updated_at"          timestamp with time zone not null default now(),
  constraint "tickets_pkey" primary key (id),
  constraint "tickets_queue_session_id_ticket_number_key" unique (queue_session_id, ticket_number)
);

alter table "public"."tickets"
  enable row level security;

create type "public"."branch_status" as enum (
  'active',
  'inactive'
);

alter table "public"."branches"
  add column "status" public.branch_status not null default 'active'::public.branch_status;

create type "public"."business_status" as enum (
  'active',
  'suspended',
  'cancelled'
);

alter table "public"."businesses"
  add column "status" public.business_status not null default 'active'::public.business_status;

create type "public"."ticket_status" as enum (
  'waiting',
  'called',
  'serving',
  'completed',
  'cancelled',
  'no_show'
);

alter table "public"."ticket_events"
  add column "event_type" public.ticket_status not null;

alter table "public"."tickets"
  add column "status" public.ticket_status not null default 'waiting'::public.ticket_status;

create type "public"."user_role" as enum (
  'owner',
  'admin',
  'manager',
  'staff'
);

alter table "public"."business_users"
  add column "role" public.user_role not null default 'staff'::public.user_role;

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

alter table "public"."branch_users"
  add constraint "branch_users_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."audit_logs"
  add constraint "audit_logs_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."branches"
  add constraint "branches_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."business_subscriptions"
  add constraint "business_subscriptions_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."business_users"
  add constraint "business_users_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."customer_sessions"
  add constraint "customer_sessions_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."customers"
  add constraint "customers_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."customer_sessions"
  add constraint "customer_sessions_customer_id_fkey" foreign key (customer_id) references public.customers(id) on delete set null;

alter table "public"."devices"
  add constraint "devices_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."notifications"
  add constraint "notifications_business_id_fkey" foreign key (business_id) references public.businesses(id) on delete cascade;

alter table "public"."notifications"
  add constraint "notifications_customer_id_fkey" foreign key (customer_id) references public.customers(id) on delete set null;

alter table "public"."operating_hours"
  add constraint "operating_hours_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."business_subscriptions"
  add constraint "business_subscriptions_plan_id_fkey" foreign key (plan_id) references public.plans(id) on delete restrict;

alter table "public"."profiles"
  add constraint "profiles_id_fkey" foreign key (id) references auth.users(id) on delete cascade;

alter table "public"."audit_logs"
  add constraint "audit_logs_user_id_fkey" foreign key (user_id) references public.profiles(id) on delete set null;

alter table "public"."branch_users"
  add constraint "branch_users_user_id_fkey" foreign key (user_id) references public.profiles(id) on delete cascade;

alter table "public"."business_users"
  add constraint "business_users_user_id_fkey" foreign key (user_id) references public.profiles(id) on delete cascade;

alter table "public"."queue_configurations"
  add constraint "queue_configurations_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."queue_sessions"
  add constraint "queue_sessions_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."services"
  add constraint "services_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."ticket_events"
  add constraint "ticket_events_performed_by_fkey" foreign key (performed_by) references public.profiles(id) on delete set null;

alter table "public"."tickets"
  add constraint "tickets_branch_id_fkey" foreign key (branch_id) references public.branches(id) on delete cascade;

alter table "public"."tickets"
  add constraint "tickets_customer_id_fkey" foreign key (customer_id) references public.customers(id) on delete set null;

alter table "public"."tickets"
  add constraint "tickets_customer_session_id_fkey" foreign key (customer_session_id) references public.customer_sessions(id) on delete set null;

alter table "public"."notifications"
  add constraint "notifications_ticket_id_fkey" foreign key (ticket_id) references public.tickets(id) on delete set null;

alter table "public"."ticket_events"
  add constraint "ticket_events_ticket_id_fkey" foreign key (ticket_id) references public.tickets(id) on delete cascade;

alter table "public"."tickets"
  add constraint "tickets_queue_session_id_fkey" foreign key (queue_session_id) references public.queue_sessions(id) on delete cascade;

alter table "public"."tickets"
  add constraint "tickets_service_id_fkey" foreign key (service_id) references public.services(id) on delete restrict;

create index idx_audit_logs_business_id on public.audit_logs using btree (business_id);

create index idx_audit_logs_user_id on public.audit_logs using btree (user_id);

create index idx_branch_users_branch_id on public.branch_users using btree (branch_id);

create index idx_branch_users_user_id on public.branch_users using btree (user_id);

create index idx_branches_business_id on public.branches using btree (business_id);

create index idx_business_subscriptions_business_id on public.business_subscriptions using btree (business_id);

create index idx_business_subscriptions_plan_id on public.business_subscriptions using btree (plan_id);

create index idx_business_users_business_id on public.business_users using btree (business_id);

create index idx_business_users_user_id on public.business_users using btree (user_id);

create index idx_customer_sessions_branch_id on public.customer_sessions using btree (branch_id);

create index idx_customer_sessions_customer_id on public.customer_sessions using btree (customer_id);

create index idx_customers_business_id on public.customers using btree (business_id);

create index idx_devices_branch_id on public.devices using btree (branch_id);

create index idx_notifications_business_id on public.notifications using btree (business_id);

create index idx_notifications_customer_id on public.notifications using btree (customer_id);

create index idx_notifications_ticket_id on public.notifications using btree (ticket_id);

create index idx_operating_hours_branch_id on public.operating_hours using btree (branch_id);

create index idx_queue_configurations_branch_id on public.queue_configurations using btree (branch_id);

create index idx_queue_sessions_branch_id on public.queue_sessions using btree (branch_id);

create index idx_services_branch_id on public.services using btree (branch_id);

create index idx_ticket_events_performed_by on public.ticket_events using btree (performed_by);

create index idx_ticket_events_ticket_id on public.ticket_events using btree (ticket_id);

create index idx_tickets_branch_id on public.tickets using btree (branch_id);

create index idx_tickets_customer_id on public.tickets using btree (customer_id);

create index idx_tickets_customer_session_id on public.tickets using btree (customer_session_id);

create index idx_tickets_queue_session_id on public.tickets using btree (queue_session_id);

create index idx_tickets_service_id on public.tickets using btree (service_id);

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create trigger validate_audit_log_user_business_trigger
  before insert or update of business_id, user_id on public.audit_logs
  for each row
  execute function public.validate_audit_log_user_business();

create trigger set_branches_updated_at
  before update on public.branches
  for each row
  execute function public.set_updated_at();

create trigger set_businesses_updated_at
  before update on public.businesses
  for each row
  execute function public.set_updated_at();

create trigger validate_customer_session_business_trigger
  before insert or update of branch_id, customer_id on public.customer_sessions
  for each row
  execute function public.validate_customer_session_business();

create trigger set_customers_updated_at
  before update on public.customers
  for each row
  execute function public.set_updated_at();

create trigger set_devices_updated_at
  before update on public.devices
  for each row
  execute function public.set_updated_at();

create trigger validate_notification_relationships_trigger
  before insert or update of business_id, customer_id, ticket_id on public.notifications
  for each row
  execute function public.validate_notification_relationships();

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

create trigger set_queue_configurations_updated_at
  before update on public.queue_configurations
  for each row
  execute function public.set_updated_at();

create trigger set_queue_sessions_updated_at
  before update on public.queue_sessions
  for each row
  execute function public.set_updated_at();

create trigger set_services_updated_at
  before update on public.services
  for each row
  execute function public.set_updated_at();

create trigger set_tickets_updated_at
  before update on public.tickets
  for each row
  execute function public.set_updated_at();

create trigger validate_ticket_branch_consistency_trigger
  before insert or update of branch_id, queue_session_id, service_id on public.tickets
  for each row
  execute function public.validate_ticket_branch_consistency();

create trigger validate_ticket_customer_business_trigger
  before insert or update of branch_id, customer_id on public.tickets
  for each row
  execute function public.validate_ticket_customer_business();

create trigger validate_ticket_customer_session_trigger
  before insert or update of branch_id, customer_id, customer_session_id on public.tickets
  for each row
  execute function public.validate_ticket_customer_session();

create policy "Business members can view audit logs" on "public"."audit_logs"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Business admins can add branch users" on "public"."branch_users"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_users.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can remove branch users" on "public"."branch_users"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = branch_users.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can update branch users" on "public"."branch_users"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = branch_users.branch_id) AND public.is_business_admin(b.business_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = branch_users.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business members can view branch users" on "public"."branch_users"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = branch_users.branch_id) AND public.is_business_member(b.business_id)))));

create policy "Business admins can create branches" on "public"."branches"
  for insert
  to "authenticated"
  with check (public.is_business_admin(business_id));

create policy "Business admins can delete branches" on "public"."branches"
  for delete
  to "authenticated"
  using (public.is_business_admin(business_id));

create policy "Business admins can update branches" on "public"."branches"
  for update
  to "authenticated"
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

create policy "Business members can view branches" on "public"."branches"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Business admins can create subscription" on "public"."business_subscriptions"
  for insert
  to "authenticated"
  with check (public.is_business_admin(business_id));

create policy "Business admins can update subscription" on "public"."business_subscriptions"
  for update
  to "authenticated"
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

create policy "Business members can view subscription" on "public"."business_subscriptions"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Business admins can add business users" on "public"."business_users"
  for insert
  to "authenticated"
  with check (public.is_business_admin(business_id));

create policy "Business admins can remove business users" on "public"."business_users"
  for delete
  to "authenticated"
  using (public.is_business_admin(business_id));

create policy "Business admins can update business users" on "public"."business_users"
  for update
  to "authenticated"
  using (public.is_business_admin(business_id))
  with check (public.is_business_admin(business_id));

create policy "Business members can view business users" on "public"."business_users"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Business admins can update their business" on "public"."businesses"
  for update
  to "authenticated"
  using (public.is_business_admin(id))
  with check (public.is_business_admin(id));

create policy "Business members can view their business" on "public"."businesses"
  for select
  to "authenticated"
  using (public.is_business_member(id));

create policy "Branch members can create customer sessions" on "public"."customer_sessions"
  for insert
  to "authenticated"
  with check (public.is_branch_member(branch_id));

create policy "Branch members can update customer sessions" on "public"."customer_sessions"
  for update
  to "authenticated"
  using (public.is_branch_member(branch_id))
  with check (public.is_branch_member(branch_id));

create policy "Branch members can view customer sessions" on "public"."customer_sessions"
  for select
  to "authenticated"
  using (public.is_branch_member(branch_id));

create policy "Business members can create customers" on "public"."customers"
  for insert
  to "authenticated"
  with check (public.is_business_member(business_id));

create policy "Business members can update customers" on "public"."customers"
  for update
  to "authenticated"
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "Business members can view customers" on "public"."customers"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Branch members can view devices" on "public"."devices"
  for select
  to "authenticated"
  using (public.is_branch_member(branch_id));

create policy "Business admins can create devices" on "public"."devices"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = devices.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can delete devices" on "public"."devices"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = devices.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can update devices" on "public"."devices"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = devices.branch_id) AND public.is_business_admin(b.business_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = devices.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business members can view notifications" on "public"."notifications"
  for select
  to "authenticated"
  using (public.is_business_member(business_id));

create policy "Business admins can create operating hours" on "public"."operating_hours"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = operating_hours.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can delete operating hours" on "public"."operating_hours"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = operating_hours.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can update operating hours" on "public"."operating_hours"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = operating_hours.branch_id) AND public.is_business_admin(b.business_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = operating_hours.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business members can view operating hours" on "public"."operating_hours"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = operating_hours.branch_id) AND public.is_business_member(b.business_id)))));

create policy "Authenticated users can view active plans" on "public"."plans"
  for select
  to "authenticated"
  using ((is_active = true));

create policy "Users can update their own profile" on "public"."profiles"
  for update
  to "authenticated"
  using ((id = auth.uid()))
  with check ((id = auth.uid()));

create policy "Users can view their own profile" on "public"."profiles"
  for select
  to "authenticated"
  using ((id = auth.uid()));

create policy "Business admins can create queue configurations" on "public"."queue_configurations"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = queue_configurations.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can delete queue configurations" on "public"."queue_configurations"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = queue_configurations.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can update queue configurations" on "public"."queue_configurations"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = queue_configurations.branch_id) AND public.is_business_admin(b.business_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = queue_configurations.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business members can view queue configurations" on "public"."queue_configurations"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = queue_configurations.branch_id) AND public.is_business_member(b.business_id)))));

create policy "Business members can create queue sessions" on "public"."queue_sessions"
  for insert
  to "authenticated"
  with check ((public.is_branch_member(branch_id) OR (EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = queue_sessions.branch_id) AND public.is_business_admin(b.business_id))))));

create policy "Business members can update queue sessions" on "public"."queue_sessions"
  for update
  to "authenticated"
  using ((public.is_branch_member(branch_id) or (exists ( select 1
   from public.branches b
  where ((b.id = queue_sessions.branch_id) AND public.is_business_admin(b.business_id))))))
  with check ((public.is_branch_member(branch_id) OR (EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = queue_sessions.branch_id) AND public.is_business_admin(b.business_id))))));

create policy "Business members can view queue sessions" on "public"."queue_sessions"
  for select
  to "authenticated"
  using ((public.is_branch_member(branch_id) or (exists ( select 1
   from public.branches b
  where ((b.id = queue_sessions.branch_id) AND public.is_business_admin(b.business_id))))));

create policy "Business admins can create services" on "public"."services"
  for insert
  to "authenticated"
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = services.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can delete services" on "public"."services"
  for delete
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = services.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business admins can update services" on "public"."services"
  for update
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = services.branch_id) AND public.is_business_admin(b.business_id)))))
  with check ((EXISTS ( SELECT 1
   FROM public.branches b
  WHERE ((b.id = services.branch_id) AND public.is_business_admin(b.business_id)))));

create policy "Business members can view services" on "public"."services"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.branches b
  where ((b.id = services.branch_id) AND public.is_business_member(b.business_id)))));

create policy "Branch members can create ticket events" on "public"."ticket_events"
  for insert
  to "authenticated"
  with check (((EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_events.ticket_id) AND public.is_branch_member(t.branch_id)))) AND ((performed_by IS NULL) OR (performed_by = auth.uid()))));

create policy "Branch members can view ticket events" on "public"."ticket_events"
  for select
  to "authenticated"
  using ((exists ( select 1
   from public.tickets t
  where ((t.id = ticket_events.ticket_id) AND public.is_branch_member(t.branch_id)))));

create policy "Branch members can create tickets" on "public"."tickets"
  for insert
  to "authenticated"
  with check (public.is_branch_member(branch_id));

create policy "Branch members can update tickets" on "public"."tickets"
  for update
  to "authenticated"
  using (public.is_branch_member(branch_id))
  with check (public.is_branch_member(branch_id));

create policy "Branch members can view tickets" on "public"."tickets"
  for select
  to "authenticated"
  using (public.is_branch_member(branch_id));

alter publication "supabase_realtime" add table "public"."notifications";

alter publication "supabase_realtime" add table "public"."queue_sessions";

alter publication "supabase_realtime" add table "public"."tickets";

grant execute on function "public"."handle_new_user"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on function "public"."is_branch_member"(uuid) from public;

grant execute on function "public"."is_branch_member"(uuid) to "authenticated", "postgres", "service_role";

revoke all on function "public"."is_business_admin"(uuid) from public;

grant execute on function "public"."is_business_admin"(uuid) to "authenticated", "postgres", "service_role";

revoke all on function "public"."is_business_member"(uuid) from public;

grant execute on function "public"."is_business_member"(uuid) to "authenticated", "postgres", "service_role";

grant execute on function "public"."set_updated_at"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_audit_log_user_business"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_customer_session_business"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_notification_relationships"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_ticket_branch_consistency"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_ticket_customer_business"() to public, "anon", "authenticated", "postgres", "service_role";

grant execute on function "public"."validate_ticket_customer_session"() to public, "anon", "authenticated", "postgres", "service_role";

revoke all on table "public"."audit_logs" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."audit_logs" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."audit_logs" to "postgres", "service_role";

revoke all on table "public"."branch_users" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."branch_users" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."branch_users" to "postgres", "service_role";

revoke all on table "public"."branches" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."branches" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."branches" to "postgres", "service_role";

revoke all on table "public"."business_subscriptions" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."business_subscriptions" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."business_subscriptions" to "postgres", "service_role";

revoke all on table "public"."business_users" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."business_users" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."business_users" to "postgres", "service_role";

revoke all on table "public"."businesses" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."businesses" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."businesses" to "postgres", "service_role";

revoke all on table "public"."customer_sessions" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."customer_sessions" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."customer_sessions" to "postgres", "service_role";

revoke all on table "public"."customers" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."customers" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."customers" to "postgres", "service_role";

revoke all on table "public"."devices" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."devices" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."devices" to "postgres", "service_role";

revoke all on table "public"."notifications" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."notifications" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."notifications" to "postgres", "service_role";

revoke all on table "public"."operating_hours" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."operating_hours" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."operating_hours" to "postgres", "service_role";

revoke all on table "public"."plans" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."plans" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."plans" to "postgres", "service_role";

revoke all on table "public"."profiles" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."profiles" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."profiles" to "postgres", "service_role";

revoke all on table "public"."queue_configurations" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."queue_configurations" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."queue_configurations" to "postgres", "service_role";

revoke all on table "public"."queue_sessions" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."queue_sessions" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."queue_sessions" to "postgres", "service_role";

revoke all on table "public"."services" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."services" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."services" to "postgres", "service_role";

revoke all on table "public"."ticket_events" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."ticket_events" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."ticket_events" to "postgres", "service_role";

revoke all on table "public"."tickets" from "authenticated";

grant delete, insert, maintain, select, update on table "public"."tickets" to "authenticated";

grant delete, insert, maintain, references, select, trigger, truncate, update on table "public"."tickets" to "postgres", "service_role";

grant usage on type "public"."branch_status" to "postgres";

grant usage on type "public"."business_status" to "postgres";

grant usage on type "public"."ticket_status" to "postgres";

grant usage on type "public"."user_role" to "postgres";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "anon";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "authenticated";

alter default privileges for role "postgres" in schema "public" grant select, update, usage on sequences to "service_role";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "anon";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "authenticated";

alter default privileges for role "postgres" in schema "public" grant execute on FUNCTIONS to "service_role";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "anon";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "authenticated";

alter default privileges for role "postgres" in schema "public" grant delete, insert, maintain, references, select, trigger, truncate, update on tables to "service_role";

