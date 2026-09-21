-- QueueDrop: indexes for the assisted-join and active-ticket hot paths.
create index if not exists idx_customers_business_phone_created
  on public.customers (business_id, phone, created_at);

create index if not exists idx_tickets_queue_service_customer_status
  on public.tickets (queue_session_id, service_id, customer_id, status);

create index if not exists idx_queue_sessions_branch_date_status
  on public.queue_sessions (branch_id, session_date, status);

notify pgrst, 'reload schema';
