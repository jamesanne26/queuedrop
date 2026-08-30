-- Allow System Owner to permanently delete unused/retired plans while
-- preserving historical subscriptions and payment orders.

alter table public.business_subscriptions
  alter column plan_id drop not null;

alter table public.subscription_orders
  alter column plan_id drop not null;

alter table public.business_subscriptions
  drop constraint if exists business_subscriptions_plan_id_fkey;
alter table public.business_subscriptions
  add constraint business_subscriptions_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;

alter table public.subscription_orders
  drop constraint if exists subscription_orders_plan_id_fkey;
alter table public.subscription_orders
  add constraint subscription_orders_plan_id_fkey
  foreign key (plan_id) references public.plans(id) on delete set null;
