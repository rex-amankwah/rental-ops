-- ============================================================
-- Phase 1A correction: normalize inventory_assets.status to
-- exactly 6 operational values.
--
-- Approved operational statuses:
--   available, reserved, out_for_delivery, on_site, returning, maintenance
--
-- Removed from status (use dedicated fields instead):
--   out          → out_for_delivery  (same operational meaning, renamed)
--   returned     → returning         (same operational meaning, renamed)
--   under_repair → maintenance       (same operational meaning, renamed)
--   damaged      → maintenance + condition='damaged'
--                  (physical state → inventory_assets.condition)
--   lost         → maintenance temporarily
--                  ⚠ RISK: disposition data not yet preserved.
--                  Future: add is_lost boolean or asset_lifecycle_events table.
--   retired      → maintenance temporarily
--                  ⚠ RISK: disposition data not yet preserved.
--                  Future: add is_retired boolean or asset_lifecycle_events table.
-- ============================================================

BEGIN;

-- ── Step 1: Drop old CHECK constraint ────────────────────────────────────────
ALTER TABLE inventory_assets
  DROP CONSTRAINT IF EXISTS inventory_assets_status_check;

-- ── Step 2: Migrate legacy operational renames ────────────────────────────────
UPDATE inventory_assets
  SET status = 'out_for_delivery'
  WHERE status = 'out';

UPDATE inventory_assets
  SET status = 'returning'
  WHERE status = 'returned';

UPDATE inventory_assets
  SET status = 'maintenance'
  WHERE status = 'under_repair';

-- ── Step 3: Migrate physical-condition values ─────────────────────────────────
-- damaged: operational status → maintenance; physical condition → condition='damaged'
UPDATE inventory_assets
  SET status    = 'maintenance',
      condition = 'damaged'
  WHERE status = 'damaged';

-- ── Step 4: Migrate lifecycle/disposition values (temporary; flag for future work) ──
-- lost: no dedicated disposition field yet — park in maintenance, note in notes column.
-- ⚠ Future: replace with is_lost flag or asset_lifecycle_events table.
UPDATE inventory_assets
  SET status = 'maintenance',
      notes  = CASE
                 WHEN notes IS NULL OR notes = '' THEN '[LIFECYCLE: was lost — requires future disposition field]'
                 ELSE notes || ' | [LIFECYCLE: was lost — requires future disposition field]'
               END
  WHERE status = 'lost';

-- retired: same pattern.
-- ⚠ Future: replace with is_retired flag or asset_lifecycle_events table.
UPDATE inventory_assets
  SET status = 'maintenance',
      notes  = CASE
                 WHEN notes IS NULL OR notes = '' THEN '[LIFECYCLE: was retired — requires future disposition field]'
                 ELSE notes || ' | [LIFECYCLE: was retired — requires future disposition field]'
               END
  WHERE status = 'retired';

-- ── Step 5: Re-add CHECK with exactly 6 approved operational values ───────────
ALTER TABLE inventory_assets
  ADD CONSTRAINT inventory_assets_status_check
  CHECK (status IN (
    'available',
    'reserved',
    'out_for_delivery',
    'on_site',
    'returning',
    'maintenance'
  ));

COMMIT;
