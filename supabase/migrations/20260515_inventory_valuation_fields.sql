-- ============================================================
-- Inventory valuation + master-data fields
-- Run in: Supabase Dashboard → SQL Editor
-- Adds valuation, depreciation, and operational columns to
-- inventory_catalog. All new columns are nullable/defaulted
-- so existing rows are completely unaffected. Safe to re-run.
--
-- Fields already present in 001_initial_schema.sql (not added here):
--   sku, category, tracking_type, rental_rate (rental_price),
--   replacement_cost, warehouse_location (storage_location)
-- ============================================================

-- 1a. Drop original auto-generated tracking_type constraint ───────────────────
--     The inline CHECK on the CREATE TABLE has an auto-generated name we don't
--     know. Locate it dynamically — but exclude our own named constraint so the
--     SELECT INTO never returns more than one row.
do $$
declare
  v_con text;
begin
  select constraint_name into v_con
  from   information_schema.table_constraints
  where  table_schema    = 'public'
    and  table_name      = 'inventory_catalog'
    and  constraint_type = 'CHECK'
    and  constraint_name like '%tracking_type%'
    and  constraint_name <> 'inventory_catalog_tracking_type_check';
  if v_con is not null then
    execute format('alter table public.inventory_catalog drop constraint %I', v_con);
  end if;
end $$;

-- 1b. Drop our own named constraint if it already exists (re-run safety) ──────
alter table public.inventory_catalog
  drop constraint if exists inventory_catalog_tracking_type_check;

-- 1c. Re-add with expanded values ─────────────────────────────────────────────
alter table public.inventory_catalog
  add constraint inventory_catalog_tracking_type_check
  check (tracking_type in ('bulk', 'serialized', 'hybrid'));

-- 2. New valuation & operational columns ─────────────────────────────────────
--    ADD COLUMN IF NOT EXISTS makes every line a no-op on re-run.
alter table public.inventory_catalog
  add column if not exists purchase_cost             numeric(10,2) null,
  add column if not exists vendor_name               text          null,
  add column if not exists purchase_date             date          null,
  add column if not exists expected_lifespan_months  integer       null,
  add column if not exists depreciation_method       text          null,
  add column if not exists residual_value            numeric(10,2) null default 0,
  add column if not exists current_book_value        numeric(10,2) null,
  add column if not exists damage_fee_default        numeric(10,2) null,
  add column if not exists replacement_fee_default   numeric(10,2) null,
  add column if not exists condition_notes           text          null,
  add column if not exists reorder_point             integer       null;

-- 3. Named check constraint for depreciation_method (idempotent) ─────────────
alter table public.inventory_catalog
  drop constraint if exists inventory_catalog_depreciation_method_check;

alter table public.inventory_catalog
  add constraint inventory_catalog_depreciation_method_check
  check (depreciation_method is null or depreciation_method in ('straight_line', 'none'));
