-- ============================================================
-- Activity logs table
-- Run in: Supabase Dashboard → SQL Editor
-- Creates the activity_logs table if it does not already exist.
-- ============================================================

create table if not exists public.activity_logs (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  order_id     uuid references public.rental_orders(id) on delete set null,
  actor_id     uuid references auth.users(id) on delete set null,
  actor_name   text,
  entity_type  text not null,
  entity_id    text,
  action       text not null,
  description  text not null,
  old_value    jsonb default null,
  new_value    jsonb default null,
  metadata     jsonb default null,
  created_at   timestamptz not null default now()
);

-- Index for dashboard / order-detail queries
create index if not exists activity_logs_company_id_created_at_idx
  on public.activity_logs (company_id, created_at desc);

create index if not exists activity_logs_order_id_idx
  on public.activity_logs (order_id)
  where order_id is not null;

-- RLS: company members can read their own logs; service role writes
alter table public.activity_logs enable row level security;

drop policy if exists "Company members can view their logs"
  on public.activity_logs;

create policy "Company members can view their logs"
  on public.activity_logs for select
  using (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );

drop policy if exists "Company members can insert logs"
  on public.activity_logs;

create policy "Company members can insert logs"
  on public.activity_logs for insert
  with check (
    company_id in (
      select company_id from public.profiles where id = auth.uid()
    )
  );
