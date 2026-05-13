import { ORDER_STATUS_CONFIG, INVOICE_STATUS_CONFIG, DISPATCH_STATUS_CONFIG, ASSET_STATUS_CONFIG } from '@/lib/constants'
import type { OrderStatus, InvoiceStatus, DispatchStatus, AssetStatus } from '@/types/database'

interface StatusBadgeProps {
  type: 'order' | 'invoice' | 'dispatch' | 'asset'
  status: string
  size?: 'sm' | 'md'
}

export function StatusBadge({ type, status, size = 'md' }: StatusBadgeProps) {
  let config: { label: string; color: string; bg: string } | undefined

  if (type === 'order') config = ORDER_STATUS_CONFIG[status as OrderStatus]
  else if (type === 'invoice') config = INVOICE_STATUS_CONFIG[status as InvoiceStatus]
  else if (type === 'dispatch') config = DISPATCH_STATUS_CONFIG[status as DispatchStatus]
  else if (type === 'asset') config = ASSET_STATUS_CONFIG[status as AssetStatus]

  if (!config) return <span className="badge bg-gray-100 text-gray-600">{status}</span>

  return (
    <span className={`badge ${config.bg} ${config.color} ${size === 'sm' ? 'text-[10px] px-1.5 py-0' : ''}`}>
      {config.label}
    </span>
  )
}

// Priority badge
const PRIORITY_CONFIG = {
  low:    { label: 'Low',    color: 'text-slate-600',  bg: 'bg-slate-100' },
  normal: { label: 'Normal', color: 'text-blue-700',   bg: 'bg-blue-100' },
  high:   { label: 'High',   color: 'text-amber-700',  bg: 'bg-amber-100' },
  urgent: { label: 'Urgent', color: 'text-red-700',    bg: 'bg-red-100' },
}

export function PriorityBadge({ priority }: { priority: string }) {
  const config = PRIORITY_CONFIG[priority as keyof typeof PRIORITY_CONFIG] ?? PRIORITY_CONFIG.normal
  return (
    <span className={`badge ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  )
}

// Role badge
const ROLE_CONFIG = {
  owner:    { label: 'Owner',    color: 'text-purple-700', bg: 'bg-purple-100' },
  admin:    { label: 'Admin',    color: 'text-indigo-700', bg: 'bg-indigo-100' },
  manager:  { label: 'Manager',  color: 'text-blue-700',   bg: 'bg-blue-100' },
  staff:    { label: 'Staff',    color: 'text-slate-700',  bg: 'bg-slate-100' },
  driver:   { label: 'Driver',   color: 'text-teal-700',   bg: 'bg-teal-100' },
  customer: { label: 'Customer', color: 'text-gray-700',   bg: 'bg-gray-100' },
}

export function RoleBadge({ role }: { role: string }) {
  const config = ROLE_CONFIG[role as keyof typeof ROLE_CONFIG] ?? ROLE_CONFIG.staff
  return (
    <span className={`badge ${config.bg} ${config.color}`}>
      {config.label}
    </span>
  )
}
