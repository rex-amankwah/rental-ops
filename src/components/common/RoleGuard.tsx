import { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canEdit, isAdmin } from '@/lib/roles'
import UnauthorizedPage from './UnauthorizedPage'

type RequiredRole = 'staff' | 'admin'

/**
 * Wraps a route element and renders UnauthorizedPage if the current user's
 * appRole does not satisfy the required minimum role.
 *
 * require="staff"  → blocks viewer users only
 * require="admin"  → blocks viewer and staff; allows manager and platform_admin
 *
 * isAdmin() returns true for both 'platform_admin' and 'manager' roles,
 * so both satisfy require="admin" gates.
 */
export default function RoleGuard({
  children,
  require: required,
}: {
  children: ReactNode
  require: RequiredRole
}) {
  const { appRole } = useAuth()

  if (required === 'admin' && !isAdmin(appRole)) return <UnauthorizedPage />
  if (required === 'staff' && !canEdit(appRole))  return <UnauthorizedPage />

  return <>{children}</>
}
