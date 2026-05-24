-- ============================================================
-- Migration: 20260524_phase1a_asset_tracking_foundation.sql
--
-- Phase 1A — Asset Tracking Foundation
-- Scope: schema, constraints, indexes, RLS, backfill only.
-- No UI, no scanner logic, no public endpoints.
--
-- ADDITIVE ONLY. The following are guaranteed unchanged:
--   • All existing tables, columns, triggers, functions
--   • orders / invoices / payments / reservations flows
--   • dispatch / return / damage workflows
--   • auth.users — not touched
--   • All existing RLS policies
--   • reserve_order_items / release_order_reservations
--   • sync_invoice_payment_totals / sync_order_payment_totals
--   • generate_invoice_from_order
--
-- What this migration does (in order):
--   A. Extend public.inventory_assets
--      1. Add asset_sequence (bigint GENERATED ALWAYS AS IDENTITY)
--      2. Add 'returned' to status CHECK constraint
--      3. Backfill qr_code_value from asset_code where NULL
--   B. Extend public.inventory_catalog
--      1. Add tracking_mode column ('bulk'|'serialized'|'bundled_serialized')
--      2. Default all existing rows to 'bulk'
--   C. Create public.asset_bundles
--   D. Create public.asset_bundle_members
--   E. Create public.order_item_assets
--   F. Create public.asset_movements  (append-only — INSERT only via RLS)
--   G. Create public.asset_maintenance
--   H. updated_at triggers for asset_bundles, asset_maintenance
--   I. Enable RLS + policies (deny-by-default, company_id isolated)
--   J. Indexes
--
-- Re-run safety: every DDL statement uses IF NOT EXISTS / DO block
-- guards so the migration is idempotent. No data is harmed on re-run.
--
-- Run in: Supabase Dashboard → SQL Editor (as postgres / service_role)
-- ============================================================


-- ============================================================
-- SECTION A: Extend public.inventory_assets
-- ============================================================

-- ── A1. Add immutable sequence counter ───────────────────────
--
-- asset_sequence is a bigint GENERATED ALWAYS AS IDENTITY.
-- It is immutable: once assigned, it never changes.
-- Existing rows receive sequence values on first run (1, 2, 3 …).
-- New rows automatically receive the next sequence value.
-- Human-readable asset codes (CHR-WHT-000184) are derived from
-- this sequence at INSERT time by the application layer.
-- The raw sequence integer is stored here for guaranteed uniqueness;
-- asset_code stores the formatted human-readable string.
--
ALTER TABLE public.inventory_assets
  ADD COLUMN IF NOT EXISTS asset_sequence bigint GENERATED ALWAYS AS IDENTITY;

-- Unique index on asset_sequence for fast lookups by sequence number.
-- (Added in Section J but declared here in comment for clarity.)

-- ── A2. Extend status CHECK to include 'returned' ────────────
--
-- 'returned' = physically back in the warehouse but not yet
-- inspected and cleared to 'available'. This prevents items from
-- skipping the inspection step and being re-rented immediately.
--
-- Strategy: use pg_constraint (same pattern as 20260520_allow_viewer_role.sql)
-- to find the constraint by content regardless of auto-generated name,
-- then drop and recreate it with the expanded value list.
--
DO $$
DECLARE
  v_con text;
BEGIN
  SELECT conname
    INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'public.inventory_assets'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%status%'
   LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.inventory_assets DROP CONSTRAINT %I', v_con
    );
    RAISE NOTICE 'Dropped old inventory_assets status constraint: %', v_con;
  ELSE
    RAISE NOTICE 'No existing status constraint found on inventory_assets.';
  END IF;
END $$;

ALTER TABLE public.inventory_assets
  ADD CONSTRAINT inventory_assets_status_check
    CHECK (status IN (
      'available',
      'reserved',
      'out',
      'returned',       -- NEW: physically back, pending inspection
      'damaged',
      'under_repair',
      'retired',
      'lost'
    ));

-- ── A3. Backfill qr_code_value from asset_code ───────────────
--
-- qr_code_value already existed in the schema (001_initial_schema.sql)
-- but was never populated. Seed it from asset_code for all existing
-- assets that don't have one yet.
-- QR values are human-readable codes, never raw UUIDs.
-- An authenticated session is required to act on a scan.
--
UPDATE public.inventory_assets
  SET qr_code_value = asset_code
 WHERE qr_code_value IS NULL;


-- ============================================================
-- SECTION B: Extend public.inventory_catalog
-- ============================================================

-- ── B1. Add tracking_mode column ─────────────────────────────
--
-- tracking_mode governs how an item participates in the asset
-- tracking system. It is separate from tracking_type (which
-- already exists and is not changed).
--
-- Values:
--   bulk               — low-value consumables; no individual asset
--                        records required; quantity-based tracking only
--   serialized         — each unit has its own inventory_assets row
--                        and is tracked individually
--   bundled_serialized — serialized units that are operationally
--                        grouped into carts/bundles for dispatch
--
-- All existing rows default to 'bulk' so no existing workflow is
-- affected. Admins opt catalog items into richer tracking modes
-- explicitly via the UI (Phase 1B).
--
ALTER TABLE public.inventory_catalog
  ADD COLUMN IF NOT EXISTS tracking_mode text NOT NULL DEFAULT 'bulk';

-- Add named check constraint idempotently.
ALTER TABLE public.inventory_catalog
  DROP CONSTRAINT IF EXISTS inventory_catalog_tracking_mode_check;

ALTER TABLE public.inventory_catalog
  ADD CONSTRAINT inventory_catalog_tracking_mode_check
    CHECK (tracking_mode IN ('bulk', 'serialized', 'bundled_serialized'));

-- Explicit backfill: all existing rows → 'bulk'
-- (DEFAULT 'bulk' handles this for existing rows via ALTER TABLE,
-- but explicit UPDATE makes the intent unambiguous and safe on re-run.)
UPDATE public.inventory_catalog
  SET tracking_mode = 'bulk'
 WHERE tracking_mode IS NULL
    OR tracking_mode NOT IN ('bulk', 'serialized', 'bundled_serialized');

COMMENT ON COLUMN public.inventory_catalog.tracking_mode IS
  'Controls asset tracking depth. bulk=quantity only; '
  'serialized=individual asset rows; '
  'bundled_serialized=serialized + operational cart grouping. '
  'Separate from tracking_type (not replaced).';


-- ============================================================
-- SECTION C: Create public.asset_bundles
-- ============================================================
--
-- Operational grouping of physical assets (carts, pallets, sets).
-- A bundle has its own QR code so scanning one QR moves all
-- member assets as a single operation.
--
-- Examples: CART-CHAIR-07 (50 gold chairs), PALLET-TENT-02 (frame tent set)
--
-- catalog_item_id is optional. Homogeneous bundles (all one item type)
-- can link to the catalog for faster availability calculations.
-- Mixed bundles leave it NULL.
--
CREATE TABLE IF NOT EXISTS public.asset_bundles (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       uuid        NOT NULL REFERENCES public.companies(id)          ON DELETE CASCADE,
  bundle_code      text        NOT NULL,                        -- CART-CHAIR-07 (user-defined, company-unique)
  qr_code_value    text        UNIQUE,                          -- encoded into QR label; never a raw UUID
  name             text        NOT NULL,                        -- "Gold Chair Cart 7"
  description      text,
  catalog_item_id  uuid        REFERENCES public.inventory_catalog(id) ON DELETE SET NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  notes            text,
  created_by       uuid        REFERENCES public.profiles(id)  ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- bundle_code must be unique within a company
  CONSTRAINT asset_bundles_company_bundle_code_unique UNIQUE (company_id, bundle_code)
);

COMMENT ON TABLE public.asset_bundles IS
  'Operational groupings of serialized assets (carts, pallets, sets). '
  'Scanning a bundle QR moves all member assets atomically.';

COMMENT ON COLUMN public.asset_bundles.bundle_code IS
  'Human-readable operational code (e.g. CART-CHAIR-07). '
  'Used as the QR payload — never expose raw UUIDs in QR codes.';

COMMENT ON COLUMN public.asset_bundles.qr_code_value IS
  'Value encoded into the physical QR label. '
  'Typically equals bundle_code. Must be unique across all bundles.';


-- ============================================================
-- SECTION D: Create public.asset_bundle_members
-- ============================================================
--
-- Effective-dated membership: which assets are currently in a bundle.
-- Rows are never deleted; removal is recorded via removed_at timestamp.
-- WHERE removed_at IS NULL gives current (active) membership.
--
-- A partial unique index (Section J) enforces that one serialized
-- asset can belong to at most one bundle at a time.
--
CREATE TABLE IF NOT EXISTS public.asset_bundle_members (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id   uuid        NOT NULL REFERENCES public.companies(id)           ON DELETE CASCADE,
  bundle_id    uuid        NOT NULL REFERENCES public.asset_bundles(id)       ON DELETE CASCADE,
  asset_id     uuid        NOT NULL REFERENCES public.inventory_assets(id)    ON DELETE CASCADE,
  added_at     timestamptz NOT NULL DEFAULT now(),
  added_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  removed_at   timestamptz,                                      -- NULL = still in bundle
  removed_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.asset_bundle_members IS
  'Effective-dated membership of assets in bundles. '
  'removed_at IS NULL = currently in bundle. '
  'Never delete rows — soft-remove by setting removed_at.';

COMMENT ON COLUMN public.asset_bundle_members.removed_at IS
  'Set to now() when asset leaves the bundle. '
  'NULL means currently active in this bundle.';


-- ============================================================
-- SECTION E: Create public.order_item_assets
-- ============================================================
--
-- Canonical record of which specific physical asset is assigned to
-- which order line item. This is the authoritative answer to:
-- "Which CHR-GOLD-XXXX is on order ORD-01023?"
--
-- Effective-dated: unassigned_at IS NULL = currently assigned.
-- A partial unique index (Section J) prevents double-assignment:
-- one asset cannot be on two orders simultaneously.
--
-- bundle_id is populated when the assignment was triggered by a
-- bundle scan (for traceability — which cart was this from?).
--
CREATE TABLE IF NOT EXISTS public.order_item_assets (
  id              uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      uuid        NOT NULL REFERENCES public.companies(id)            ON DELETE CASCADE,
  order_id        uuid        NOT NULL REFERENCES public.rental_orders(id)        ON DELETE CASCADE,
  order_item_id   uuid        NOT NULL REFERENCES public.order_items(id)          ON DELETE CASCADE,
  asset_id        uuid        NOT NULL REFERENCES public.inventory_assets(id)     ON DELETE RESTRICT,
  bundle_id       uuid        REFERENCES public.asset_bundles(id)                 ON DELETE SET NULL,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  assigned_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  unassigned_at   timestamptz,                                    -- NULL = currently assigned
  unassigned_by   uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes           text
);

COMMENT ON TABLE public.order_item_assets IS
  'Authoritative assignment of a specific physical asset to an order line. '
  'unassigned_at IS NULL = currently assigned. '
  'bundle_id records which cart triggered the assignment (if any).';

COMMENT ON COLUMN public.order_item_assets.unassigned_at IS
  'Set to now() when asset is removed from the order. '
  'NULL means currently assigned.';


-- ============================================================
-- SECTION F: Create public.asset_movements
-- ============================================================
--
-- APPEND-ONLY audit trail of every state change for every asset.
-- This table records the complete lifecycle of each physical unit.
--
-- RLS enforces append-only access:
--   • INSERT is allowed for operational roles
--   • UPDATE is PROHIBITED (no UPDATE policy = deny-by-default)
--   • DELETE is PROHIBITED (no DELETE policy = deny-by-default)
--
-- No updated_at column — the record is immutable by design.
-- performed_at records when the movement actually occurred.
--
CREATE TABLE IF NOT EXISTS public.asset_movements (
  id            uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    uuid        NOT NULL REFERENCES public.companies(id)           ON DELETE CASCADE,
  asset_id      uuid        NOT NULL REFERENCES public.inventory_assets(id)    ON DELETE RESTRICT,
  bundle_id     uuid        REFERENCES public.asset_bundles(id)                ON DELETE SET NULL,
  order_id      uuid        REFERENCES public.rental_orders(id)                ON DELETE SET NULL,
  dispatch_id   uuid        REFERENCES public.dispatches(id)                   ON DELETE SET NULL,
  return_id     uuid        REFERENCES public.returns(id)                      ON DELETE SET NULL,

  -- Movement classification
  movement_type text        NOT NULL,
  from_status   text,                 -- snapshot of status before this movement
  to_status     text,                 -- snapshot of status after this movement
  from_location text,
  to_location   text,

  -- Actor
  performed_by  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  performed_at  timestamptz NOT NULL DEFAULT now(),

  -- Flexible context
  notes         text,
  metadata      jsonb,                -- future: scan device, coordinates, etc.

  CONSTRAINT asset_movements_movement_type_check
    CHECK (movement_type IN (
      'assigned',         -- asset assigned to an order line item
      'unassigned',       -- asset removed from an order line item
      'checkout',         -- asset loaded onto truck / left warehouse
      'delivered',        -- asset confirmed delivered to venue
      'checkin',          -- asset physically returned to warehouse
      'inspected',        -- post-return inspection completed; cleared to available
      'damaged',          -- damage event recorded on this asset
      'maintenance_in',   -- asset sent to maintenance / under repair
      'maintenance_out',  -- asset cleared from maintenance
      'retired',          -- asset permanently removed from service
      'located',          -- inventory audit scan; location confirmed
      'status_change'     -- manual admin correction with explanation in notes
    ))
);

COMMENT ON TABLE public.asset_movements IS
  'Immutable append-only lifecycle audit trail for every physical asset. '
  'No UPDATE or DELETE policies exist — RLS enforces immutability. '
  'Do not add an updated_at column to this table.';

COMMENT ON COLUMN public.asset_movements.movement_type IS
  'Lifecycle event type. See CHECK constraint for valid values. '
  'Use status_change for manual corrections; always include notes.';

COMMENT ON COLUMN public.asset_movements.metadata IS
  'Reserved for future use: scan device ID, GPS coordinates, etc. '
  'Store as JSON; no schema enforced at DB level.';


-- ============================================================
-- SECTION G: Create public.asset_maintenance
-- ============================================================
--
-- Service and repair records for individual physical assets.
-- linked_damage_report_id connects corrective maintenance to a
-- damage event. linked_expense_id connects repair costs to the
-- expense ledger (optional — for future financial reconciliation).
--
CREATE TABLE IF NOT EXISTS public.asset_maintenance (
  id                       uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               uuid        NOT NULL REFERENCES public.companies(id)           ON DELETE CASCADE,
  asset_id                 uuid        NOT NULL REFERENCES public.inventory_assets(id)    ON DELETE RESTRICT,
  linked_damage_report_id  uuid        REFERENCES public.damage_reports(id)               ON DELETE SET NULL,
  linked_expense_id        uuid        REFERENCES public.expenses(id)                     ON DELETE SET NULL,

  -- Classification
  maintenance_type  text     NOT NULL,
  status            text     NOT NULL DEFAULT 'scheduled',
  title             text     NOT NULL,
  description       text,

  -- Scheduling & completion
  scheduled_date    date,
  started_at        date,
  completed_at      date,

  -- Cost
  estimated_cost    numeric(10,2),
  actual_cost       numeric(10,2),

  -- Who did the work
  vendor_name       text,             -- external repair shop name (if applicable)
  performed_by      uuid    REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Supporting media
  photo_urls        text[],
  notes             text,

  -- Audit
  created_by        uuid    REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT asset_maintenance_type_check
    CHECK (maintenance_type IN (
      'routine_inspection',
      'repair',
      'deep_clean',
      'refurbishment',
      'parts_replacement'
    )),

  CONSTRAINT asset_maintenance_status_check
    CHECK (status IN (
      'scheduled',
      'in_progress',
      'completed',
      'cancelled'
    ))
);

COMMENT ON TABLE public.asset_maintenance IS
  'Service, repair, and inspection records for individual physical assets. '
  'Link to damage_reports for corrective maintenance. '
  'Link to expenses for cost reconciliation.';


-- ============================================================
-- SECTION H: updated_at triggers
-- ============================================================
--
-- Re-uses the existing update_updated_at() function from
-- 001_initial_schema.sql. No new function needed.
--

-- asset_bundles
DROP TRIGGER IF EXISTS trg_asset_bundles_updated_at ON public.asset_bundles;
CREATE TRIGGER trg_asset_bundles_updated_at
  BEFORE UPDATE ON public.asset_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- asset_maintenance
DROP TRIGGER IF EXISTS trg_asset_maintenance_updated_at ON public.asset_maintenance;
CREATE TRIGGER trg_asset_maintenance_updated_at
  BEFORE UPDATE ON public.asset_maintenance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- asset_bundle_members — no updated_at (soft-remove via removed_at; no updates)
-- order_item_assets    — no updated_at (soft-remove via unassigned_at; no updates)
-- asset_movements      — no updated_at (append-only; no updates ever)


-- ============================================================
-- SECTION I: Row Level Security
-- ============================================================
--
-- Tenant isolation: every policy checks company_id = get_my_company_id().
-- Deny-by-default: no policy = no access.
-- Role hierarchy used throughout (consistent with 001_initial_schema.sql):
--   manager-and-above : ('owner','admin','manager')
--   operational staff : ('owner','admin','manager','staff')
--   all incl. drivers : ('owner','admin','manager','staff','driver')
--   read-only          : add 'viewer' to SELECT policies
--
-- CRITICAL — asset_movements:
--   INSERT allowed for operational roles.
--   No UPDATE policy → UPDATE is denied (deny-by-default).
--   No DELETE policy → DELETE is denied (deny-by-default).
--   This enforces append-only at the database layer, not just app layer.
--

-- ── Enable RLS on all new tables ─────────────────────────────
ALTER TABLE public.asset_bundles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_bundle_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_assets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_movements        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_maintenance      ENABLE ROW LEVEL SECURITY;


-- ── asset_bundles ─────────────────────────────────────────────
-- Everyone in the company can view bundles (drivers need to look up
-- bundle contents when scanning a cart QR).
-- Only manager-and-above can create, modify, or deactivate bundles.
-- Only owner/admin can hard-delete a bundle definition.

DROP POLICY IF EXISTS "asset_bundles_select" ON public.asset_bundles;
CREATE POLICY "asset_bundles_select" ON public.asset_bundles
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

DROP POLICY IF EXISTS "asset_bundles_insert" ON public.asset_bundles;
CREATE POLICY "asset_bundles_insert" ON public.asset_bundles
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );

DROP POLICY IF EXISTS "asset_bundles_update" ON public.asset_bundles;
CREATE POLICY "asset_bundles_update" ON public.asset_bundles
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );

DROP POLICY IF EXISTS "asset_bundles_delete" ON public.asset_bundles;
CREATE POLICY "asset_bundles_delete" ON public.asset_bundles
  FOR DELETE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin')
  );


-- ── asset_bundle_members ──────────────────────────────────────
-- All company members can view membership (drivers need to see
-- which assets are in a bundle they scanned).
-- Staff+ can add/remove assets from bundles (warehouse operations).
-- Manager+ can update membership records (soft-delete via removed_at).

DROP POLICY IF EXISTS "bundle_members_select" ON public.asset_bundle_members;
CREATE POLICY "bundle_members_select" ON public.asset_bundle_members
  FOR SELECT USING (
    company_id = get_my_company_id()
  );

DROP POLICY IF EXISTS "bundle_members_insert" ON public.asset_bundle_members;
CREATE POLICY "bundle_members_insert" ON public.asset_bundle_members
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff')
  );

DROP POLICY IF EXISTS "bundle_members_update" ON public.asset_bundle_members;
CREATE POLICY "bundle_members_update" ON public.asset_bundle_members
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );


-- ── order_item_assets ─────────────────────────────────────────
-- Staff and drivers can view assignments (drivers see which assets
-- are on their dispatch orders).
-- Staff+ can create and soft-remove assignments (dispatch operations).
-- No hard-delete policy — assignments are permanent records.

DROP POLICY IF EXISTS "order_item_assets_select" ON public.order_item_assets;
CREATE POLICY "order_item_assets_select" ON public.order_item_assets
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff', 'driver')
  );

DROP POLICY IF EXISTS "order_item_assets_insert" ON public.order_item_assets;
CREATE POLICY "order_item_assets_insert" ON public.order_item_assets
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff')
  );

DROP POLICY IF EXISTS "order_item_assets_update" ON public.order_item_assets;
CREATE POLICY "order_item_assets_update" ON public.order_item_assets
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff')
  );


-- ── asset_movements ───────────────────────────────────────────
-- CRITICAL: NO UPDATE POLICY. NO DELETE POLICY.
-- The absence of these policies (combined with RLS being enabled)
-- means UPDATE and DELETE are categorically denied for ALL roles,
-- including owner and admin. This enforces the audit trail's
-- immutability at the database layer.
--
-- Drivers are included in INSERT to allow scan events during dispatch.

DROP POLICY IF EXISTS "asset_movements_select" ON public.asset_movements;
CREATE POLICY "asset_movements_select" ON public.asset_movements
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff', 'driver')
  );

DROP POLICY IF EXISTS "asset_movements_insert" ON public.asset_movements;
CREATE POLICY "asset_movements_insert" ON public.asset_movements
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff', 'driver')
  );

-- !! NO UPDATE POLICY — intentionally omitted — UPDATE is denied !!
-- !! NO DELETE POLICY — intentionally omitted — DELETE is denied !!


-- ── asset_maintenance ─────────────────────────────────────────
-- All operational staff can view and create maintenance records.
-- Only manager-and-above can update records (close, approve, cost).
-- No delete policy — maintenance history is permanent.

DROP POLICY IF EXISTS "asset_maintenance_select" ON public.asset_maintenance;
CREATE POLICY "asset_maintenance_select" ON public.asset_maintenance
  FOR SELECT USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff')
  );

DROP POLICY IF EXISTS "asset_maintenance_insert" ON public.asset_maintenance;
CREATE POLICY "asset_maintenance_insert" ON public.asset_maintenance
  FOR INSERT WITH CHECK (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager', 'staff')
  );

DROP POLICY IF EXISTS "asset_maintenance_update" ON public.asset_maintenance;
CREATE POLICY "asset_maintenance_update" ON public.asset_maintenance
  FOR UPDATE USING (
    company_id = get_my_company_id()
    AND get_my_role() IN ('owner', 'admin', 'manager')
  );


-- ============================================================
-- SECTION J: Indexes
-- ============================================================
--
-- All FK columns get basic indexes for join performance.
-- High-traffic lookup paths get composite or partial indexes.
-- Naming convention: idx_{table}_{columns}[_{qualifier}]
--

-- ── inventory_assets (additions only) ────────────────────────

-- Fast QR scan lookup — the hottest read path in the entire system
CREATE INDEX IF NOT EXISTS idx_assets_qr_code_value
  ON public.inventory_assets(qr_code_value);

-- Lookup by human-readable code per company
CREATE INDEX IF NOT EXISTS idx_assets_asset_code_company
  ON public.inventory_assets(company_id, asset_code);

-- Status filter (e.g. "show all damaged assets in our company")
CREATE INDEX IF NOT EXISTS idx_assets_status_company
  ON public.inventory_assets(company_id, status);

-- asset_sequence lookup (unique — also used for code generation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_asset_sequence
  ON public.inventory_assets(asset_sequence);

-- ── inventory_catalog (additions only) ───────────────────────

-- Filter by tracking_mode (e.g. "show all serialized catalog items")
CREATE INDEX IF NOT EXISTS idx_catalog_tracking_mode_company
  ON public.inventory_catalog(company_id, tracking_mode);

-- ── asset_bundles ─────────────────────────────────────────────

-- Company filter (list all bundles)
CREATE INDEX IF NOT EXISTS idx_asset_bundles_company_id
  ON public.asset_bundles(company_id);

-- QR scan lookup for bundle codes (hottest path after asset QR scan)
CREATE INDEX IF NOT EXISTS idx_asset_bundles_qr_code_value
  ON public.asset_bundles(qr_code_value);

-- Optional catalog item link (find all bundles of a given item type)
CREATE INDEX IF NOT EXISTS idx_asset_bundles_catalog_item_id
  ON public.asset_bundles(catalog_item_id);

-- ── asset_bundle_members ──────────────────────────────────────

-- Primary lookup: all current members of a bundle (O(1) → O(members))
-- This is the path executed when a bundle QR is scanned.
CREATE INDEX IF NOT EXISTS idx_bundle_members_bundle_id
  ON public.asset_bundle_members(bundle_id);

-- Reverse lookup: which bundle is this asset currently in?
CREATE INDEX IF NOT EXISTS idx_bundle_members_asset_id
  ON public.asset_bundle_members(asset_id);

-- PARTIAL UNIQUE: one asset can be in at most ONE active bundle.
-- Enforced at DB level, not just application layer.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bundle_members_one_active_bundle_per_asset
  ON public.asset_bundle_members(company_id, asset_id)
  WHERE removed_at IS NULL;

-- ── order_item_assets ─────────────────────────────────────────

-- All asset assignments on an order
CREATE INDEX IF NOT EXISTS idx_order_item_assets_order_id
  ON public.order_item_assets(order_id);

-- Assignments for a specific line item
CREATE INDEX IF NOT EXISTS idx_order_item_assets_order_item_id
  ON public.order_item_assets(order_item_id);

-- Which order is this asset currently assigned to?
CREATE INDEX IF NOT EXISTS idx_order_item_assets_asset_id
  ON public.order_item_assets(asset_id);

-- Which assignments came from a bundle scan?
CREATE INDEX IF NOT EXISTS idx_order_item_assets_bundle_id
  ON public.order_item_assets(bundle_id);

-- PARTIAL UNIQUE: one asset can be actively assigned to at most ONE order.
-- Prevents double-booking the same physical unit across concurrent orders.
-- Enforced at DB level.
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_item_assets_one_active_assignment_per_asset
  ON public.order_item_assets(company_id, asset_id)
  WHERE unassigned_at IS NULL;

-- ── asset_movements ───────────────────────────────────────────

-- Full movement history for a single asset (most common query)
CREATE INDEX IF NOT EXISTS idx_asset_movements_asset_id_performed_at
  ON public.asset_movements(asset_id, performed_at DESC);

-- All movements on an order (order detail audit view)
CREATE INDEX IF NOT EXISTS idx_asset_movements_order_id
  ON public.asset_movements(order_id)
  WHERE order_id IS NOT NULL;

-- All movements on a dispatch (dispatch reconciliation)
CREATE INDEX IF NOT EXISTS idx_asset_movements_dispatch_id
  ON public.asset_movements(dispatch_id)
  WHERE dispatch_id IS NOT NULL;

-- All movements on a return (return reconciliation)
CREATE INDEX IF NOT EXISTS idx_asset_movements_return_id
  ON public.asset_movements(return_id)
  WHERE return_id IS NOT NULL;

-- All movements from a bundle scan operation
CREATE INDEX IF NOT EXISTS idx_asset_movements_bundle_id
  ON public.asset_movements(bundle_id)
  WHERE bundle_id IS NOT NULL;

-- Company-level movement log sorted by time (dashboard / audit view)
CREATE INDEX IF NOT EXISTS idx_asset_movements_company_performed_at
  ON public.asset_movements(company_id, performed_at DESC);

-- ── asset_maintenance ─────────────────────────────────────────

-- All maintenance records for a single asset
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_asset_id
  ON public.asset_maintenance(asset_id);

-- Maintenance queue by status per company
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_status_company
  ON public.asset_maintenance(company_id, status);

-- Corrective maintenance linked to a damage report
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_damage_report_id
  ON public.asset_maintenance(linked_damage_report_id)
  WHERE linked_damage_report_id IS NOT NULL;

-- Maintenance linked to expense record
CREATE INDEX IF NOT EXISTS idx_asset_maintenance_expense_id
  ON public.asset_maintenance(linked_expense_id)
  WHERE linked_expense_id IS NOT NULL;


-- ============================================================
-- END OF MIGRATION
-- ============================================================
--
-- Summary of changes:
--
--   Tables modified:
--     public.inventory_assets   — added asset_sequence, expanded status CHECK, backfilled qr_code_value
--     public.inventory_catalog  — added tracking_mode column, defaulted all rows to 'bulk'
--
--   Tables created:
--     public.asset_bundles
--     public.asset_bundle_members
--     public.order_item_assets
--     public.asset_movements
--     public.asset_maintenance
--
--   Tables NOT touched (confirmed):
--     rental_orders, order_items, inventory_reservations,
--     invoices, invoice_items, payments, dispatches, dispatch_items,
--     returns, return_items, damage_reports, expenses, customers,
--     profiles, companies, vehicles, staff_assignments,
--     activity_logs, notifications
--
--   Functions NOT touched (confirmed):
--     get_my_company_id(), get_my_role(), is_manager_or_above(),
--     check_item_availability(), reserve_order_items(),
--     release_order_reservations(), generate_invoice_from_order(),
--     sync_invoice_payment_totals(), sync_order_payment_totals(),
--     can_manage_company_profiles(), generate_order_number(),
--     generate_invoice_number(), generate_report_number()
--
--   RLS NOT touched (confirmed):
--     All existing policies on all existing tables remain exactly
--     as they were before this migration.
--
-- ============================================================
