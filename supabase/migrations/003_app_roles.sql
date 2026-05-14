-- =============================================================
-- Migration 003: Normalize profiles.role to 3-role app system
-- Safe: ADD COLUMN IF NOT EXISTS guard handles both cases —
--   column already exists (no-op) or is missing (adds it).
-- Roles: admin | staff | viewer  (default: staff)
-- =============================================================

BEGIN;

-- Step 1: Ensure the column exists regardless of whether 001 was applied.
--   IF NOT EXISTS makes this idempotent and harmless if already present.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text DEFAULT 'staff';

-- Step 2: Normalize any legacy or NULL role values to the new 3-role set.
--   owner, admin        → admin
--   customer            → viewer
--   manager, staff,
--   driver, NULL, other → staff
--   Already-valid values (admin, staff, viewer) are untouched.
UPDATE public.profiles
  SET role = CASE
    WHEN role IN ('owner', 'admin') THEN 'admin'
    WHEN role = 'customer'          THEN 'viewer'
    ELSE                                 'staff'
  END
  WHERE role IS NULL OR role NOT IN ('admin', 'staff', 'viewer');

-- Step 3: Drop the old check constraint if it exists.
--   Name follows PostgreSQL inline-constraint convention: <table>_<col>_check.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Step 4: Add new constraint covering only the 3 valid app roles.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'viewer'));

-- Step 5: Lock in 'staff' as the default for all future inserts.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'staff';

-- Step 6: Update the DB helper used in RLS policies.
--   admin replaces the old (owner | admin | manager) tier.
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT public.get_my_role() = 'admin'
$$;

COMMIT;
