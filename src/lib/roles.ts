import type { AppRole } from '@/types/database'

/**
 * Normalise any stored role string to a valid AppRole.
 * Legacy values (owner, manager, driver, customer) and anything unknown
 * collapse to the safe default 'staff' or 'viewer' as appropriate.
 */
export function toAppRole(role: string | null | undefined): AppRole {
  if (role === 'admin')  return 'admin'
  if (role === 'viewer') return 'viewer'
  if (role === 'staff')  return 'staff'
  // Legacy mappings
  if (role === 'owner')    return 'admin'
  if (role === 'customer') return 'viewer'
  // manager, driver, unknown → staff
  return 'staff'
}

/** True only for admin role. */
export function isAdmin(role: string | null | undefined): boolean {
  return toAppRole(role) === 'admin'
}

/** True for admin and staff — anyone who can create or modify records. */
export function canEdit(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}

/** True for admin and staff — anyone allowed to see revenue, balances, invoices. */
export function canViewFinancials(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}

/** True for admin and staff — anyone who can create or advance dispatches. */
export function canDispatch(role: string | null | undefined): boolean {
  return toAppRole(role) !== 'viewer'
}
