-- ============================================================
-- Migration: 20260520_fix_profiles_team_update_rls.sql
--
-- Problem:
--   Team profile updates (full_name, role, is_active) made via
--   the Team & Roles settings page do not persist after refresh.
--
-- Root causes:
--   1. The existing profiles_update policy has only a USING clause
--      and no explicit WITH CHECK. PostgreSQL implicitly reuses
--      USING as WITH CHECK, but this fails in certain PostgREST
--      versions when a BEFORE trigger (trg_profiles_updated_at)
--      modifies the row mid-flight — the WITH CHECK runs against
--      the trigger-modified row and can silently reject the write,
--      returning 0 affected rows while UPDATE appears to succeed.
--
--   2. Migration 003_app_roles.sql broke is_manager_or_above() by
--      narrowing it to get_my_role() = 'admin' only. Any path that
--      reaches this helper (instead of the raw IN check) rejects
--      users whose DB role was updated to 'manager' or 'owner' by
--      the 4-role RBAC migration.
--
-- Fix:
--   1. Drop and recreate profiles_update with an explicit WITH CHECK
--      that mirrors the USING clause — eliminating the implicit
--      reuse ambiguity.
--   2. Restore is_manager_or_above() to cover all three admin-tier
--      DB role values: owner, admin, manager.
--
-- Security guarantees:
--   - Any user can update their own profile row (id = auth.uid()).
--   - owner / admin / manager DB roles can update any profile
--     within their own company_id — not across companies.
--   - staff / viewer / driver / customer cannot update other
--     team member profiles.
--   - Cross-company updates remain blocked.
--   - RLS stays enabled on public.profiles.
--   - auth.users is not touched.
--   - No data is modified; this is a policy-only change.
-- ============================================================

-- ── Step 1: drop the existing policy ─────────────────────────
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- ── Step 2: recreate with explicit USING + WITH CHECK ─────────
CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE
  USING (
    -- Always allow users to update their own profile row
    (id = auth.uid())
    OR
    -- Admin-tier users can update any profile in their own company.
    -- Covers all three valid admin-tier DB role values:
    --   owner   = platform_admin in app (stored as 'owner')
    --   admin   = legacy tenant admin  (stored as 'admin', pre-RBAC)
    --   manager = current tenant admin (stored as 'manager')
    (
      company_id = get_my_company_id()
      AND get_my_role() IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    -- The updated row must still satisfy the same conditions.
    -- Explicit WITH CHECK prevents implicit-reuse issues with
    -- BEFORE UPDATE triggers (trg_profiles_updated_at).
    (id = auth.uid())
    OR
    (
      company_id = get_my_company_id()
      AND get_my_role() IN ('owner', 'admin', 'manager')
    )
  );

-- ── Step 3: fix is_manager_or_above() ────────────────────────
-- Migration 003_app_roles.sql narrowed this function to
-- get_my_role() = 'admin' only, silently breaking callers that
-- relied on it returning true for 'manager' and 'owner'.
-- Restore to the original intent: all three admin-tier values.
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
AS $$
  SELECT get_my_role() IN ('owner', 'admin', 'manager')
$$;
