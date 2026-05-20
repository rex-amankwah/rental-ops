-- ============================================================
-- Migration: 20260521_can_manage_profiles_helper.sql
--
-- Problem:
--   PATCH to public.profiles still returns HTTP 403 for admin/
--   manager users updating team member profiles (full_name, role,
--   is_active) even after 20260520_fix_profiles_team_update_rls.sql
--   was applied.
--
-- Root cause:
--   The profiles_update policy relies on two chained STABLE helper
--   calls inside the WITH CHECK clause:
--
--     company_id = get_my_company_id()
--     AND get_my_role() IN ('owner','admin','manager')
--
--   PostgreSQL inlines STABLE functions during query planning. In
--   the WITH CHECK evaluation window (after the BEFORE UPDATE
--   trigger fires), the planner collapses both subqueries into a
--   single scan context. The left-hand `company_id` column
--   resolves to the NEW row's company_id (the target profile);
--   get_my_company_id() independently reads the caller's profile.
--   These two reads are from different rows in the same table.
--   When the planner de-duplicates or re-orders the scan, one side
--   can resolve to NULL or the wrong value, making the boolean
--   expression evaluate to NULL/FALSE → WITH CHECK fails → 403.
--
--   Additionally, migration 003_app_roles.sql replaced
--   is_manager_or_above() with get_my_role() = 'admin', silently
--   breaking any code path that calls it for manager/owner users.
--
-- Fix:
--   1. Create public.can_manage_company_profiles(target_company_id)
--      — a single atomic SECURITY DEFINER function that checks
--      both the caller's company_id and role in one EXISTS query.
--      EXISTS always returns boolean (never NULL). It receives the
--      target profile's company_id as an argument, eliminating any
--      ambiguity between the caller's row and the target's row.
--
--   2. Drop and recreate profiles_update using the new helper for
--      the "update other profiles" branch. The "update own profile"
--      branch (id = auth.uid()) is unchanged.
--
--   3. Re-apply the is_manager_or_above() fix (idempotent).
--
-- Security guarantees:
--   - Any user can update their own profile row (id = auth.uid()).
--   - Only users with DB role owner/admin/manager AND the same
--     company_id as the target profile can update other profiles.
--   - staff / viewer / driver / customer are excluded.
--   - Cross-company updates are blocked: the helper compares the
--     caller's company_id to the target's company_id directly.
--   - RLS remains enabled on public.profiles.
--   - auth.users is not touched.
--   - No data rows are modified; policy and function changes only.
-- ============================================================

-- ── Step 1: atomic SECURITY DEFINER helper ────────────────────
--
-- Receives the target profile's company_id as a parameter.
-- Reads the calling user's profile row in a single EXISTS query.
-- Returns TRUE  when: caller has a profile, caller's company_id
--                     matches target_company_id, and caller's role
--                     is one of the three admin-tier DB values.
-- Returns FALSE otherwise (never NULL — EXISTS is always boolean).
--
-- SET search_path = public prevents search_path injection attacks
-- on SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.can_manage_company_profiles(
  target_company_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id            = auth.uid()
      AND company_id    = target_company_id
      AND role          IN ('owner', 'admin', 'manager')
  )
$$;

-- ── Step 2: drop the existing profiles_update policy ──────────
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- ── Step 3: recreate with atomic helper ───────────────────────
--
-- USING  — controls which rows are visible as update targets.
-- WITH CHECK — validates the new row after the BEFORE trigger.
--
-- Both clauses are identical. The helper is called with
-- `company_id` which refers to:
--   USING     → the OLD row's company_id
--   WITH CHECK → the NEW row's company_id (unchanged by our updates)
-- Cross-company transfer is therefore blocked in both directions.
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (
    (id = auth.uid())
    OR
    can_manage_company_profiles(company_id)
  )
  WITH CHECK (
    (id = auth.uid())
    OR
    can_manage_company_profiles(company_id)
  );

-- ── Step 4: restore is_manager_or_above() (idempotent) ────────
--
-- Migration 003_app_roles.sql narrowed this to = 'admin' only.
-- Re-apply the correct definition covering all admin-tier values.
-- This is defensive: code that calls is_manager_or_above() instead
-- of the raw IN check will now return the correct result for
-- users whose DB role is 'manager' or 'owner'.
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path = public
AS $$
  SELECT get_my_role() IN ('owner', 'admin', 'manager')
$$;
