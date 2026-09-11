-- Configurable tax per plan, with immutable tax snapshots on each billing order.
alter table public.plans
  add column if not exists tax_mode text not null default 'non_vat',
  add column if not exists vat_rate numeric(5,2) not null default 0,
  add column if not exists tax_price_mode text not null default 'inclusive';

do $$ begin alter table public.plans add constraint plans_tax_mode_check check (tax_mode in ('non_vat','vat')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.plans add constraint plans_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.plans add constraint plans_tax_price_mode_check check (tax_price_mode in ('inclusive','exclusive')); exception when duplicate_object then null; end $$;

alter table public.subscription_orders
  add column if not exists subtotal numeric(12,2),
  add column if not exists tax_mode text not null default 'non_vat',
  add column if not exists vat_rate numeric(5,2) not null default 0,
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists tax_price_mode text not null default 'inclusive';

update public.subscription_orders set subtotal = amount where subtotal is null;
alter table public.subscription_orders alter column subtotal set not null;
do $$ begin alter table public.subscription_orders add constraint subscription_orders_tax_mode_check check (tax_mode in ('non_vat','vat')); exception when duplicate_object then null; end $$;
do $$ begin alter table public.subscription_orders add constraint subscription_orders_vat_rate_check check (vat_rate >= 0 and vat_rate <= 100); exception when duplicate_object then null; end $$;
do $$ begin alter table public.subscription_orders add constraint subscription_orders_tax_price_mode_check check (tax_price_mode in ('inclusive','exclusive')); exception when duplicate_object then null; end $$;

alter table public.payments
  add column if not exists subtotal numeric(12,2),
  add column if not exists tax_amount numeric(12,2) not null default 0,
  add column if not exists vat_rate numeric(5,2) not null default 0,
  add column if not exists tax_mode text not null default 'non_vat';
update public.payments set subtotal = amount where subtotal is null;
