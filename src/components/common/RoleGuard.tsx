import { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { canEdit, isAdmin } from '@/lib/roles'
import UnauthorizedPage from './UnauthorizedPage'

type RequiredRole = 'staff' | 'admin'

/**
 * Wraps a route element and renders UnauthorizedPage if the current user's
 * appRole does not satisfy the required minimum role.
 *
 * require="staff"  → blocks viewer (read-only) users
 * require="admin"  → blocks both viewer and staff users
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
