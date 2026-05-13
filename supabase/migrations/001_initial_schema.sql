-- =============================================================
-- RentalOps Phase 1 Migration
-- Multi-tenant event rental management system
-- =============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
-- pg_net (HTTP from DB) deferred to Phase 4 when webhooks are needed

-- =============================================================
-- HELPER FUNCTIONS
-- =============================================================

-- Get company_id of the currently authenticated user
create or replace function get_my_company_id()
returns uuid
language sql
security definer
stable
as $$
  select company_id from public.profiles where id = auth.uid()
$$;

-- Get role of the currently authenticated user
create or replace function get_my_role()
returns text
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Check if current user has at least manager level
create or replace function is_manager_or_above()
returns boolean
language sql
security definer
stable
as $$
  select get_my_role() in ('owner', 'admin', 'manager')
$$;

-- =============================================================
-- TABLE: companies
-- Top-level tenant. Every other table references this.
-- =============================================================
create table if not exists public.companies (
  id                uuid primary key default uuid_generate_v4(),
  name              text not null,
  slug              text unique not null,
  email             text,
  phone             text,
  address           text,
  city              text,
  state             text,
  zip               text,
  country           text default 'US',
  logo_url          text,
  timezone          text default 'America/Chicago',
  currency          text default 'USD',
  tax_rate          numeric(5,4) default 0.0825,
  default_rental_days int default 1,
  active            boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- =============================================================
-- TABLE: profiles
-- Extends Supabase auth.users. One profile per user.
-- =============================================================
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  company_id        uuid references public.companies(id) on delete cascade,
  email             text not null,
  full_name         text,
  phone             text,
  avatar_url        text,
  role              text not null default 'staff'
                    check (role in ('owner','admin','manager','staff','driver','customer')),
  is_active         boolean default true,
  last_seen_at      timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- =============================================================
-- TABLE: customers
-- PII-sensitive. RLS restricts driver/customer access.
-- =============================================================
create table if not exists public.customers (
  id                uuid primary key default uuid_generate_v4(),
  company_id        uuid not null references public.companies(id) on delete cascade,
  first_name        text not null,
  last_name         text not null,
  email             text,
  phone             text,
  phone_alt         text,
  company_name      text,
  billing_address   text,
  billing_city      text,
  billing_state     text,
  billing_zip       text,
  notes             text,
  tags              text[],
  source            text,         -- how they found us
  total_orders      int default 0,
  total_spent       numeric(12,2) default 0,
  is_active         boolean default true,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

-- =============================================================
-- TABLE: inventory_catalog
-- Item types (White Chair, 10x10 Canopy, etc.)
-- Dual tracking: serialized or bulk
-- =============================================================
create table if not exists public.inventory_catalog (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  name                text not null,
  sku                 text,
  category            text not null,   -- chairs, tables, canopies, tents, decor, utensils, linens, other
  description         text,
  tracking_type       text not null default 'bulk'
                      check (tracking_type in ('serialized','bulk')),
  rental_rate         numeric(10,2) not null default 0,
  replacement_cost    numeric(10,2) default 0,
  quantity_owned      int not null default 0,
  quantity_available  int not null default 0,
  quantity_reserved   int not null default 0,
  quantity_out        int not null default 0,
  quantity_damaged    int not null default 0,
  quantity_under_repair int not null default 0,
  warehouse_location  text,
  image_url           text,
  notes               text,
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  constraint qty_check check (quantity_available >= 0)
);

-- =============================================================
-- TABLE: inventory_assets
-- Individual serialized items (CHAIR-GOLD-0001 etc.)
-- Only used when catalog item tracking_type = 'serialized'
-- QR-ready from day one.
-- =============================================================
create table if not exists public.inventory_assets (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  catalog_item_id     uuid not null references public.inventory_catalog(id) on delete cascade,
  asset_code          text not null,         -- CHAIR-GOLD-0001
  qr_code_value       text unique,           -- encoded URL or asset ID for QR scanning
  status              text not null default 'available'
                      check (status in ('available','reserved','out','damaged','under_repair','retired','lost')),
  condition           text default 'good'
                      check (condition in ('excellent','good','fair','poor','damaged')),
  warehouse_location  text,
  purchase_date       date,
  purchase_price      numeric(10,2),
  last_scanned_at     timestamptz,
  last_scanned_by     uuid references public.profiles(id),
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique(company_id, asset_code)
);

-- =============================================================
-- TABLE: rental_orders
-- The core object. Everything connects here.
-- =============================================================
create table if not exists public.rental_orders (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_number        text unique not null,
  customer_id         uuid references public.customers(id),

  -- Status
  status              text not null default 'inquiry'
                      check (status in (
                        'inquiry','quote_sent','awaiting_deposit','confirmed',
                        'inventory_reserved','scheduled_for_dispatch',
                        'out_for_delivery','setup_in_progress','event_active',
                        'pickup_scheduled','returned','inspection','completed',
                        'closed','cancelled','refunded','partially_returned',
                        'damaged','overdue'
                      )),

  -- Event details
  event_name          text,
  event_type          text,
  event_date          date,
  event_end_date      date,
  event_start_time    time,
  event_end_time      time,
  guest_count         int,

  -- Venue
  venue_name          text,
  venue_address       text,
  venue_city          text,
  venue_state         text,
  venue_zip           text,
  venue_notes         text,

  -- Delivery/Pickup scheduling
  delivery_date       date,
  delivery_time       time,
  pickup_date         date,
  pickup_time         time,
  rental_days         int not null default 1,

  -- Financials (summary — detail in invoices/payments)
  subtotal            numeric(12,2) default 0,
  delivery_fee        numeric(12,2) default 0,
  setup_fee           numeric(12,2) default 0,
  discount_amount     numeric(12,2) default 0,
  tax_amount          numeric(12,2) default 0,
  total_amount        numeric(12,2) default 0,
  deposit_required    numeric(12,2) default 0,
  deposit_paid        numeric(12,2) default 0,
  amount_paid         numeric(12,2) default 0,
  balance_due         numeric(12,2) default 0,

  -- Assignment
  assigned_to         uuid references public.profiles(id),
  sales_rep_id        uuid references public.profiles(id),

  -- Metadata
  source              text,           -- phone, website, walk-in, referral
  priority            text default 'normal' check (priority in ('low','normal','high','urgent')),
  internal_notes      text,
  customer_notes      text,
  tags                text[],
  created_by          uuid references public.profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- Auto-generate order numbers
create sequence if not exists rental_order_seq start 1000;

create or replace function generate_order_number()
returns trigger
language plpgsql
as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'ORD-' || lpad(nextval('rental_order_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger set_order_number
  before insert on public.rental_orders
  for each row execute function generate_order_number();

-- =============================================================
-- TABLE: order_items
-- Line items on a rental order
-- Snapshots item name/rate so historical orders don't drift
-- =============================================================
create table if not exists public.order_items (
  id                    uuid primary key default uuid_generate_v4(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  order_id              uuid not null references public.rental_orders(id) on delete cascade,
  catalog_item_id       uuid references public.inventory_catalog(id),

  -- Snapshot fields (locked at time of order)
  item_name_snapshot    text not null,
  item_sku_snapshot     text,
  category_snapshot     text,

  quantity              int not null default 1,
  unit_rate             numeric(10,2) not null default 0,
  rental_days           int not null default 1,
  line_total            numeric(12,2) not null default 0,

  -- Fulfillment tracking
  reservation_status    text default 'pending'
                        check (reservation_status in ('pending','reserved','confirmed','out','returned','cancelled')),
  returned_quantity     int default 0,
  damaged_quantity      int default 0,
  missing_quantity      int default 0,

  notes                 text,
  sort_order            int default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- =============================================================
-- TABLE: inventory_reservations
-- Date-based inventory locking (prevents double-booking)
-- =============================================================
create table if not exists public.inventory_reservations (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid not null references public.rental_orders(id) on delete cascade,
  order_item_id       uuid references public.order_items(id),
  catalog_item_id     uuid not null references public.inventory_catalog(id),
  asset_id            uuid references public.inventory_assets(id),  -- null for bulk

  quantity_reserved   int not null default 1,
  reserved_from       date not null,
  reserved_until      date not null,
  status              text not null default 'active'
                      check (status in ('active','released','cancelled')),

  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =============================================================
-- TABLE: invoices
-- Financial document tied to an order.
-- Supports multiple invoices per order (deposit + balance, etc.)
-- =============================================================
create table if not exists public.invoices (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  invoice_number      text unique not null,
  order_id            uuid references public.rental_orders(id),
  customer_id         uuid references public.customers(id),

  status              text not null default 'draft'
                      check (status in ('draft','sent','partial','paid','overdue','refunded','voided')),

  -- Financials
  subtotal            numeric(12,2) not null default 0,
  delivery_fee        numeric(12,2) default 0,
  setup_fee           numeric(12,2) default 0,
  discount            numeric(12,2) default 0,
  tax_rate            numeric(5,4) default 0.0825,
  tax_amount          numeric(12,2) default 0,
  security_deposit    numeric(12,2) default 0,
  total               numeric(12,2) not null default 0,
  amount_paid         numeric(12,2) default 0,
  balance_due         numeric(12,2) default 0,

  -- Dates
  issue_date          date default current_date,
  due_date            date,
  sent_at             timestamptz,
  paid_at             timestamptz,

  -- Content
  notes               text,
  footer_text         text,
  created_by          uuid references public.profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create sequence if not exists invoice_seq start 1000;

create or replace function generate_invoice_number()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'INV-' || lpad(nextval('invoice_seq')::text, 5, '0');
  end if;
  return new;
end;
$$;

create trigger set_invoice_number
  before insert on public.invoices
  for each row execute function generate_invoice_number();

-- =============================================================
-- TABLE: invoice_items
-- Immutable snapshots of line items.
-- These NEVER change after invoice is sent.
-- =============================================================
create table if not exists public.invoice_items (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  invoice_id          uuid not null references public.invoices(id) on delete cascade,
  order_item_id       uuid references public.order_items(id),

  description         text not null,
  quantity            int not null default 1,
  unit_rate           numeric(10,2) not null default 0,
  rental_days         int not null default 1,
  line_total          numeric(12,2) not null default 0,

  sort_order          int default 0,
  created_at          timestamptz default now()
);

-- =============================================================
-- TABLE: payments
-- Tracks all money movement (deposits, partial, full, refunds)
-- =============================================================
create table if not exists public.payments (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid references public.rental_orders(id),
  invoice_id          uuid references public.invoices(id),
  customer_id         uuid references public.customers(id),

  payment_type        text not null default 'payment'
                      check (payment_type in ('deposit','payment','partial_payment','refund','security_deposit','security_refund')),
  method              text not null default 'cash'
                      check (method in ('cash','check','card','venmo','zelle','paypal','bank_transfer','other')),
  status              text not null default 'completed'
                      check (status in ('pending','completed','failed','refunded','voided')),

  amount              numeric(12,2) not null,
  reference           text,         -- check number, transaction ID, etc.
  notes               text,

  payment_date        date default current_date,
  processed_by        uuid references public.profiles(id),
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =============================================================
-- TABLE: vehicles
-- Company vehicles used for delivery
-- =============================================================
create table if not exists public.vehicles (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  name                text not null,
  type                text default 'truck' check (type in ('truck','van','trailer','pickup','other')),
  make                text,
  model               text,
  year                int,
  license_plate       text,
  capacity_notes      text,
  is_active           boolean default true,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =============================================================
-- TABLE: dispatches
-- Delivery and pickup jobs
-- =============================================================
create table if not exists public.dispatches (
  id                      uuid primary key default uuid_generate_v4(),
  company_id              uuid not null references public.companies(id) on delete cascade,
  order_id                uuid not null references public.rental_orders(id) on delete cascade,

  dispatch_type           text not null default 'delivery'
                          check (dispatch_type in ('delivery','pickup','both')),
  status                  text not null default 'scheduled'
                          check (status in (
                            'scheduled','loading','out_for_delivery','delivered',
                            'setup_done','pickup_pending','returned','cancelled'
                          )),

  driver_id               uuid references public.profiles(id),
  vehicle_id              uuid references public.vehicles(id),
  crew_ids                uuid[],

  scheduled_delivery_date date,
  scheduled_delivery_time time,
  scheduled_pickup_date   date,
  scheduled_pickup_time   time,

  actual_delivery_at      timestamptz,
  actual_pickup_at        timestamptz,

  -- Customer-facing info (drivers can see this)
  delivery_address        text,
  delivery_city           text,
  delivery_state          text,
  delivery_zip            text,
  contact_name            text,
  contact_phone           text,
  delivery_notes          text,
  pickup_notes            text,
  route_notes             text,

  -- Proof of delivery
  delivery_signature_url  text,
  delivery_photo_url      text,

  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- =============================================================
-- TABLE: dispatch_items
-- Items loaded on a specific dispatch
-- =============================================================
create table if not exists public.dispatch_items (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  dispatch_id         uuid not null references public.dispatches(id) on delete cascade,
  order_item_id       uuid references public.order_items(id),
  catalog_item_id     uuid references public.inventory_catalog(id),
  asset_id            uuid references public.inventory_assets(id),

  quantity_loaded     int default 0,
  quantity_delivered  int default 0,
  quantity_returned   int default 0,

  scan_loaded_at      timestamptz,     -- QR scan when loaded onto truck
  scan_delivered_at   timestamptz,     -- QR scan at delivery
  scan_returned_at    timestamptz,     -- QR scan on return

  notes               text,
  created_at          timestamptz default now()
);

-- =============================================================
-- TABLE: staff_assignments
-- Links staff profiles to orders for task management
-- =============================================================
create table if not exists public.staff_assignments (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid not null references public.rental_orders(id) on delete cascade,
  profile_id          uuid not null references public.profiles(id),
  role_on_order       text,           -- lead, helper, driver, setup, etc.
  notes               text,
  created_at          timestamptz default now()
);

-- =============================================================
-- TABLE: returns
-- When rental items come back
-- =============================================================
create table if not exists public.returns (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid not null references public.rental_orders(id) on delete cascade,
  dispatch_id         uuid references public.dispatches(id),

  status              text not null default 'pending'
                      check (status in ('pending','in_progress','completed','disputed')),
  return_date         date,
  received_by         uuid references public.profiles(id),
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =============================================================
-- TABLE: return_items
-- Individual item condition on return
-- =============================================================
create table if not exists public.return_items (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  return_id           uuid not null references public.returns(id) on delete cascade,
  order_item_id       uuid references public.order_items(id),
  catalog_item_id     uuid references public.inventory_catalog(id),
  asset_id            uuid references public.inventory_assets(id),

  quantity_expected   int not null default 0,
  quantity_returned   int default 0,
  quantity_damaged    int default 0,
  quantity_missing    int default 0,

  condition           text default 'good'
                      check (condition in ('excellent','good','fair','poor','damaged')),
  notes               text,
  photo_url           text,
  created_at          timestamptz default now()
);

-- =============================================================
-- TABLE: damage_reports
-- Formal damage documentation linked to orders/assets
-- =============================================================
create table if not exists public.damage_reports (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid references public.rental_orders(id),
  return_item_id      uuid references public.return_items(id),
  catalog_item_id     uuid references public.inventory_catalog(id),
  asset_id            uuid references public.inventory_assets(id),
  customer_id         uuid references public.customers(id),

  report_number       text unique,
  status              text not null default 'open'
                      check (status in ('open','assessed','billed','resolved','waived')),
  severity            text default 'minor'
                      check (severity in ('minor','moderate','major','total_loss')),

  description         text not null,
  estimated_cost      numeric(10,2),
  actual_cost         numeric(10,2),
  charged_to_customer boolean default false,
  charge_amount       numeric(10,2),

  reported_by         uuid references public.profiles(id),
  photo_urls          text[],
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create sequence if not exists damage_report_seq start 100;

create or replace function generate_report_number()
returns trigger
language plpgsql
as $$
begin
  if new.report_number is null then
    new.report_number := 'DMG-' || lpad(nextval('damage_report_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger set_report_number
  before insert on public.damage_reports
  for each row execute function generate_report_number();

-- =============================================================
-- TABLE: expenses
-- Operational costs (labor, fuel, repairs, supplies)
-- =============================================================
create table if not exists public.expenses (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid references public.rental_orders(id),

  category            text not null
                      check (category in ('labor','fuel','repair','supplies','transport','marketing','other')),
  description         text not null,
  amount              numeric(10,2) not null,
  expense_date        date default current_date,
  paid_by             uuid references public.profiles(id),
  receipt_url         text,
  notes               text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

-- =============================================================
-- TABLE: activity_logs
-- Immutable audit trail for all major actions
-- =============================================================
create table if not exists public.activity_logs (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  order_id            uuid references public.rental_orders(id),
  actor_id            uuid references public.profiles(id),
  actor_name          text,

  entity_type         text not null,      -- order, invoice, payment, dispatch, etc.
  entity_id           uuid,
  action              text not null,      -- created, updated, status_changed, sent, etc.
  description         text not null,

  old_value           jsonb,
  new_value           jsonb,
  metadata            jsonb,

  created_at          timestamptz default now()
);

-- =============================================================
-- TABLE: notifications
-- System and user notifications
-- =============================================================
create table if not exists public.notifications (
  id                  uuid primary key default uuid_generate_v4(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  recipient_id        uuid references public.profiles(id),

  type                text not null,      -- overdue_invoice, low_inventory, dispatch_due, etc.
  title               text not null,
  body                text,
  link                text,              -- internal route to navigate to
  is_read             boolean default false,
  read_at             timestamptz,
  related_order_id    uuid references public.rental_orders(id),
  metadata            jsonb,
  created_at          timestamptz default now()
);

-- =============================================================
-- UPDATED_AT TRIGGER (applied to all relevant tables)
-- =============================================================
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_companies_updated_at before update on public.companies for each row execute function update_updated_at();
create trigger trg_profiles_updated_at before update on public.profiles for each row execute function update_updated_at();
create trigger trg_customers_updated_at before update on public.customers for each row execute function update_updated_at();
create trigger trg_catalog_updated_at before update on public.inventory_catalog for each row execute function update_updated_at();
create trigger trg_assets_updated_at before update on public.inventory_assets for each row execute function update_updated_at();
create trigger trg_orders_updated_at before update on public.rental_orders for each row execute function update_updated_at();
create trigger trg_order_items_updated_at before update on public.order_items for each row execute function update_updated_at();
create trigger trg_reservations_updated_at before update on public.inventory_reservations for each row execute function update_updated_at();
create trigger trg_invoices_updated_at before update on public.invoices for each row execute function update_updated_at();
create trigger trg_payments_updated_at before update on public.payments for each row execute function update_updated_at();
create trigger trg_dispatches_updated_at before update on public.dispatches for each row execute function update_updated_at();
create trigger trg_vehicles_updated_at before update on public.vehicles for each row execute function update_updated_at();
create trigger trg_returns_updated_at before update on public.returns for each row execute function update_updated_at();
create trigger trg_damage_reports_updated_at before update on public.damage_reports for each row execute function update_updated_at();
create trigger trg_expenses_updated_at before update on public.expenses for each row execute function update_updated_at();

-- =============================================================
-- INDEXES (performance for common queries)
-- =============================================================
create index if not exists idx_profiles_company_id on public.profiles(company_id);
create index if not exists idx_customers_company_id on public.customers(company_id);
create index if not exists idx_orders_company_id on public.rental_orders(company_id);
create index if not exists idx_orders_customer_id on public.rental_orders(customer_id);
create index if not exists idx_orders_status on public.rental_orders(status);
create index if not exists idx_orders_event_date on public.rental_orders(event_date);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_catalog_company_id on public.inventory_catalog(company_id);
create index if not exists idx_assets_catalog_id on public.inventory_assets(catalog_item_id);
create index if not exists idx_reservations_catalog_id on public.inventory_reservations(catalog_item_id);
create index if not exists idx_reservations_dates on public.inventory_reservations(reserved_from, reserved_until);
create index if not exists idx_invoices_order_id on public.invoices(order_id);
create index if not exists idx_invoices_company_id on public.invoices(company_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_dispatches_order_id on public.dispatches(order_id);
create index if not exists idx_dispatches_driver_id on public.dispatches(driver_id);
create index if not exists idx_activity_logs_order_id on public.activity_logs(order_id);
create index if not exists idx_activity_logs_company_id on public.activity_logs(company_id);
create index if not exists idx_notifications_recipient on public.notifications(recipient_id, is_read);

-- =============================================================
-- ROW LEVEL SECURITY POLICIES
-- =============================================================

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.inventory_catalog enable row level security;
alter table public.inventory_assets enable row level security;
alter table public.rental_orders enable row level security;
alter table public.order_items enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.vehicles enable row level security;
alter table public.dispatches enable row level security;
alter table public.dispatch_items enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.returns enable row level security;
alter table public.return_items enable row level security;
alter table public.damage_reports enable row level security;
alter table public.expenses enable row level security;
alter table public.activity_logs enable row level security;
alter table public.notifications enable row level security;

-- -------
-- COMPANIES: user can only see their own company
-- -------
create policy "companies_select" on public.companies
  for select using (
    id = get_my_company_id()
  );

create policy "companies_update" on public.companies
  for update using (
    id = get_my_company_id() and get_my_role() in ('owner','admin')
  );

-- -------
-- PROFILES: see all profiles in own company
-- -------
create policy "profiles_select" on public.profiles
  for select using (
    company_id = get_my_company_id()
  );

create policy "profiles_insert" on public.profiles
  for insert with check (
    -- Allow a user to insert their own profile row (onboarding: no profile exists yet,
    -- so get_my_company_id() returns NULL — we allow if id matches auth.uid())
    -- After insertion, normal company_id isolation takes over for all future queries.
    id = auth.uid()
  );

create policy "profiles_update" on public.profiles
  for update using (
    -- Can update own profile, or admin/manager can update others in company
    (id = auth.uid()) or
    (company_id = get_my_company_id() and get_my_role() in ('owner','admin','manager'))
  );

-- -------
-- CUSTOMERS: full access for admin/manager/staff; no access for drivers
-- -------
create policy "customers_select" on public.customers
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "customers_insert" on public.customers
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "customers_update" on public.customers
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "customers_delete" on public.customers
  for delete using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin')
  );

-- -------
-- INVENTORY_CATALOG: all staff can view; admin/manager can edit
-- -------
create policy "catalog_select" on public.inventory_catalog
  for select using (company_id = get_my_company_id());

create policy "catalog_insert" on public.inventory_catalog
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "catalog_update" on public.inventory_catalog
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "catalog_delete" on public.inventory_catalog
  for delete using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin')
  );

-- -------
-- INVENTORY_ASSETS: all staff can view/scan; admin/manager can edit
-- -------
create policy "assets_select" on public.inventory_assets
  for select using (company_id = get_my_company_id());

create policy "assets_insert" on public.inventory_assets
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "assets_update" on public.inventory_assets
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff','driver')
  );

-- -------
-- RENTAL_ORDERS: all staff can view; drivers see only assigned orders
-- -------
create policy "orders_select_staff" on public.rental_orders
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "orders_select_driver" on public.rental_orders
  for select using (
    company_id = get_my_company_id() and
    get_my_role() = 'driver' and
    id in (
      select order_id from public.dispatches
      where driver_id = auth.uid()
    )
  );

create policy "orders_insert" on public.rental_orders
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "orders_update" on public.rental_orders
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "orders_delete" on public.rental_orders
  for delete using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin')
  );

-- -------
-- ORDER_ITEMS: same as orders
-- -------
create policy "order_items_select" on public.order_items
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "order_items_insert" on public.order_items
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "order_items_update" on public.order_items
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

-- -------
-- INVENTORY_RESERVATIONS
-- -------
create policy "reservations_select" on public.inventory_reservations
  for select using (company_id = get_my_company_id());

create policy "reservations_insert" on public.inventory_reservations
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "reservations_update" on public.inventory_reservations
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

-- -------
-- INVOICES: staff can view; only admin/manager can create/edit
-- -------
create policy "invoices_select" on public.invoices
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "invoices_insert" on public.invoices
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "invoices_update" on public.invoices
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- INVOICE_ITEMS
-- -------
create policy "invoice_items_select" on public.invoice_items
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "invoice_items_insert" on public.invoice_items
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- PAYMENTS: only admin/manager can see and create
-- -------
create policy "payments_select" on public.payments
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "payments_insert" on public.payments
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "payments_update" on public.payments
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin')
  );

-- -------
-- VEHICLES
-- -------
create policy "vehicles_select" on public.vehicles
  for select using (company_id = get_my_company_id());

create policy "vehicles_insert" on public.vehicles
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "vehicles_update" on public.vehicles
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- DISPATCHES: drivers see only their dispatches
-- -------
create policy "dispatches_select_staff" on public.dispatches
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "dispatches_select_driver" on public.dispatches
  for select using (
    company_id = get_my_company_id() and
    get_my_role() = 'driver' and
    driver_id = auth.uid()
  );

create policy "dispatches_insert" on public.dispatches
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "dispatches_update" on public.dispatches
  for update using (
    company_id = get_my_company_id() and
    (
      get_my_role() in ('owner','admin','manager') or
      (get_my_role() = 'driver' and driver_id = auth.uid())
    )
  );

-- -------
-- DISPATCH_ITEMS
-- -------
create policy "dispatch_items_select" on public.dispatch_items
  for select using (company_id = get_my_company_id());

create policy "dispatch_items_insert" on public.dispatch_items
  for insert with check (company_id = get_my_company_id());

create policy "dispatch_items_update" on public.dispatch_items
  for update using (company_id = get_my_company_id());

-- -------
-- STAFF_ASSIGNMENTS
-- -------
create policy "staff_assignments_select" on public.staff_assignments
  for select using (company_id = get_my_company_id());

create policy "staff_assignments_insert" on public.staff_assignments
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- RETURNS
-- -------
create policy "returns_select" on public.returns
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "returns_insert" on public.returns
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "returns_update" on public.returns
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

-- -------
-- RETURN_ITEMS
-- -------
create policy "return_items_select" on public.return_items
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "return_items_insert" on public.return_items
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

-- -------
-- DAMAGE_REPORTS
-- -------
create policy "damage_reports_select" on public.damage_reports
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "damage_reports_insert" on public.damage_reports
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "damage_reports_update" on public.damage_reports
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- EXPENSES: only admin/manager
-- -------
create policy "expenses_select" on public.expenses
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "expenses_insert" on public.expenses
  for insert with check (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

create policy "expenses_update" on public.expenses
  for update using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager')
  );

-- -------
-- ACTIVITY_LOGS: immutable, read-only for all staff
-- -------
create policy "activity_logs_select" on public.activity_logs
  for select using (
    company_id = get_my_company_id() and
    get_my_role() in ('owner','admin','manager','staff')
  );

create policy "activity_logs_insert" on public.activity_logs
  for insert with check (company_id = get_my_company_id());

-- -------
-- NOTIFICATIONS: users see only their own
-- -------
create policy "notifications_select" on public.notifications
  for select using (
    company_id = get_my_company_id() and
    (recipient_id = auth.uid() or get_my_role() in ('owner','admin'))
  );

create policy "notifications_update" on public.notifications
  for update using (
    recipient_id = auth.uid()
  );

create policy "notifications_insert" on public.notifications
  for insert with check (company_id = get_my_company_id());

-- =============================================================
-- SEED DATA (sample company + demo data for UI preview)
-- =============================================================

-- IMPORTANT: This seed data must be run in the Supabase SQL Editor
-- while logged in as the postgres/service_role user (the default in
-- the SQL editor). It will NOT work if run via the anon key because
-- RLS policies block inserts from unauthenticated sessions.
--
-- How to run:
--   1. Go to Supabase Dashboard → SQL Editor
--   2. Paste and run this entire migration file
--   3. The SQL editor runs as postgres (superuser), bypassing RLS
--
-- In production, companies and profiles are created via your
-- onboarding flow using the service_role key (server-side only).

-- Temporarily set role to bypass RLS for seed inserts
set local role postgres;

-- Sample company
insert into public.companies (id, name, slug, email, phone, address, city, state, zip, timezone)
values (
  '00000000-0000-0000-0000-000000000001',
  'Elite Event Rentals',
  'elite-event-rentals',
  'hello@eliterentals.com',
  '(281) 555-0100',
  '1400 Event Blvd',
  'Houston',
  'TX',
  '77001',
  'America/Chicago'
) on conflict do nothing;

-- Inventory catalog items
insert into public.inventory_catalog (company_id, name, sku, category, tracking_type, rental_rate, replacement_cost, quantity_owned, quantity_available, warehouse_location) values
('00000000-0000-0000-0000-000000000001', 'White Folding Chair', 'CHR-WHT-001', 'chairs', 'bulk', 1.50, 18.00, 500, 480, 'Bay A'),
('00000000-0000-0000-0000-000000000001', 'Gold Chiavari Chair', 'CHR-GOLD-001', 'chairs', 'serialized', 5.00, 85.00, 100, 94, 'Bay B'),
('00000000-0000-0000-0000-000000000001', 'Silver Chiavari Chair', 'CHR-SLV-001', 'chairs', 'serialized', 5.00, 85.00, 80, 78, 'Bay B'),
('00000000-0000-0000-0000-000000000001', '60" Round Table', 'TBL-60RND-001', 'tables', 'bulk', 12.00, 120.00, 60, 55, 'Bay C'),
('00000000-0000-0000-0000-000000000001', '8ft Banquet Table', 'TBL-8BNQ-001', 'tables', 'bulk', 10.00, 95.00, 40, 38, 'Bay C'),
('00000000-0000-0000-0000-000000000001', '6ft Banquet Table', 'TBL-6BNQ-001', 'tables', 'bulk', 9.00, 80.00, 30, 29, 'Bay C'),
('00000000-0000-0000-0000-000000000001', '10x10 Pop-Up Canopy', 'CNP-1010-001', 'canopies', 'serialized', 45.00, 350.00, 20, 18, 'Bay D'),
('00000000-0000-0000-0000-000000000001', '20x20 Frame Tent', 'TNT-2020-001', 'tents', 'serialized', 250.00, 1800.00, 6, 5, 'Bay E'),
('00000000-0000-0000-0000-000000000001', '40x60 Pole Tent', 'TNT-4060-001', 'tents', 'serialized', 850.00, 6500.00, 3, 3, 'Bay E'),
('00000000-0000-0000-0000-000000000001', 'Utensil Set (50 ct)', 'UTN-50SET-001', 'utensils', 'bulk', 25.00, 75.00, 30, 28, 'Bay F'),
('00000000-0000-0000-0000-000000000001', 'White Linen Tablecloth 60"', 'LNN-WHT60-001', 'linens', 'bulk', 8.00, 25.00, 150, 142, 'Bay G'),
('00000000-0000-0000-0000-000000000001', 'Black Linen Tablecloth 60"', 'LNN-BLK60-001', 'linens', 'bulk', 8.00, 25.00, 100, 98, 'Bay G'),
('00000000-0000-0000-0000-000000000001', 'LED Globe String Lights (50ft)', 'DCR-LED50-001', 'decor', 'serialized', 35.00, 120.00, 25, 23, 'Bay H'),
('00000000-0000-0000-0000-000000000001', 'Arch Backdrop Frame', 'DCR-ARCH-001', 'decor', 'serialized', 75.00, 280.00, 8, 7, 'Bay H')
on conflict do nothing;

-- Sample customers (no real PII)
insert into public.customers (id, company_id, first_name, last_name, email, phone, company_name, billing_city, billing_state, total_orders, total_spent) values
('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Maria', 'Rodriguez', 'maria.r@email.com', '(713) 555-0201', null, 'Houston', 'TX', 4, 3850.00),
('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'James', 'Thompson', 'james.t@email.com', '(281) 555-0202', 'Thompson Events LLC', 'Sugar Land', 'TX', 12, 22400.00),
('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Priya', 'Patel', 'ppatel@gmail.com', '(832) 555-0203', null, 'Pearland', 'TX', 2, 1200.00),
('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'David', 'Kim', 'dkim@weddingplanner.com', '(713) 555-0204', 'Kim Wedding Design', 'Houston', 'TX', 28, 68500.00),
('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Aisha', 'Johnson', 'aisha.j@email.com', '(281) 555-0205', null, 'Katy', 'TX', 1, 450.00),
('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'Roberto', 'Garza', 'rob.garza@catering.com', '(713) 555-0206', 'Garza Catering', 'Houston', 'TX', 7, 9800.00)
on conflict do nothing;
