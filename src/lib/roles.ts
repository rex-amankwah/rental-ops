import type { AppRole } from '@/types/database'

/**
 * Normalise any raw DB role string to a valid AppRole.
 *
 * DB value          → AppRole
 * ─────────────────────────────────────────────────
 * 'owner'           → 'platform_admin'  (SaaS owner)
 * 'admin'           → 'manager'         (backward compat — legacy tenant admin)
 * 'manager'         → 'manager'         (tenant/company admin)
 * 'staff'           → 'staff'
 * 'driver'          → 'staff'
 * 'viewer'          → 'viewer'
 * 'customer'        → 'viewer'
 * 'platform_admin'  → 'platform_admin'  (already normalized)
 * anything else     → 'staff'           (safe default)
 */
export function toAppRole(role: string | null | undefined): AppRole {
  if (role === 'platform_admin') return 'platform_admin'
  if (role === 'owner')          return 'platform_admin'
  if (role === 'admin')          return 'manager'   // backward compat
  if (role === 'manager')        return 'manager'
  if (role === 'staff')          return 'staff'
  if (role === 'driver')         return 'staff'
  if (role === 'viewer')   return 'viewer'
  // 'customer' is not an internal operations role — falls through to safe default
  return 'staff'
}

/**
 * Convert a normalized AppRole back to the raw DB value for writes.
 * Only call this when persisting to public.profiles.role.
 */
export function fromAppRole(appRole: AppRole): string {
  if (appRole === 'platform_admin') return 'owner'
  if (appRole === 'manager')        return 'manager'
  if (appRole === 'staff')          return 'staff'
  return 'viewer'
}

/** True only for platform_admin (SaaS / platform owner). */
export function isPlatformAdmin(role: string | null | undefined): boolean {
  return toAppRole(role) === 'platform_admin'
}

/** True only for manager (tenant admin). */
export function isManager(role: string | null | undefined): boolean {
  return toAppRole(role) === 'manager'
}

/**
 * True for platform_admin OR manager.
 * Preserves existing "admin-level" semantics — all existing isAdmin() call sites
 * continue to work correctly under the new role model.
 */
export function isAdmin(role: string | null | undefined): boolean {
  const r = toAppRole(role)
  return r === 'platform_admin' || r === 'manager'
}

/**
 * True for platform_admin and manager — can manage team membership and roles.
 */
export function canManageTeam(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/**
 * True for platform_admin and manager — can access and edit company settings.
 */
export function canManageCompanySettings(role: string | null | undefined): boolean {
  return isAdmin(role)
}

/** True for platform_admin, manager, and staff — anyone who can create or modify records. */
export function canEdit(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}

/** True for platform_admin, manager, and staff — anyone allowed to see revenue, balances, invoices. */
export function canViewFinancials(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}

/** True for platform_admin, manager, and staff — anyone who can create or advance dispatches. */
export function canDispatch(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}
