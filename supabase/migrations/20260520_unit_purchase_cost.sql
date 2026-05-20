-- ============================================================
-- Migration: 20260520_unit_purchase_cost.sql
-- Adds unit_purchase_cost column to inventory_catalog.
-- Preserves existing purchase_cost for backward compatibility.
-- total_asset_value is derived at query time: unit_purchase_cost * quantity_owned
-- ============================================================

ALTER TABLE inventory_catalog
  ADD COLUMN IF NOT EXISTS unit_purchase_cost numeric(10,2) NULL;

COMMENT ON COLUMN inventory_catalog.unit_purchase_cost IS
  'Per-unit acquisition cost. Used for depreciation estimates and total asset value (unit_purchase_cost × quantity_owned). Replaces purchase_cost going forward; purchase_cost retained for backward compatibility.';
