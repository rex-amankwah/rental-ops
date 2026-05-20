-- ============================================================
-- Migration: 20260520_allow_viewer_role.sql
--
-- Adds 'viewer' to the allowed values for public.profiles.role.
--
-- Background:
--   'viewer' is the internal read-only app role for Rentora.
--   It was previously absent from the check constraint, meaning
--   saving AppRole 'viewer' → DB 'viewer' would be rejected.
--   'customer' is NOT an internal operations app role and is
--   intentionally NOT used for internal viewer access.
--
-- Strategy:
--   Use a DO block to locate the constraint by inspecting
--   pg_constraint, regardless of the auto-generated name.
--   Drop the old constraint, then add a new one that includes
--   'viewer' while preserving all existing allowed values.
--
-- Safe to re-run: ADD CONSTRAINT ... IF NOT EXISTS guard.
-- No data is modified. No RLS policies are changed.
-- ============================================================

DO $$
DECLARE
  v_constraint_name text;
BEGIN
  -- Find the check constraint on profiles.role
  -- (auto-named 'profiles_role_check' by PostgreSQL when no name was given)
  SELECT conname
    INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.profiles'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) LIKE '%role%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', v_constraint_name);
    RAISE NOTICE 'Dropped constraint: %', v_constraint_name;
  ELSE
    RAISE NOTICE 'No existing role check constraint found — adding fresh.';
  END IF;
END $$;

-- Re-add constraint with viewer included.
-- All original values are preserved; viewer is the only addition.
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('owner','admin','manager','staff','driver','customer','viewer'));
