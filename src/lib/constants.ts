import type { OrderStatus, InvoiceStatus, DispatchStatus, AssetStatus, TrackingMode, AssetMovementType } from '@/types/database'

// ============================================================
// ORDER STATUS CONFIG
// ============================================================

export const ORDER_STATUS_CONFIG: Record<OrderStatus, {
  label: string
  color: string
  bg: string
  description: string
  group: 'pre_event' | 'active' | 'post_event' | 'closed'
}> = {
  inquiry:              { label: 'Inquiry',            color: 'text-slate-600',   bg: 'bg-slate-100',   description: 'New inquiry received',          group: 'pre_event' },
  quote_sent:           { label: 'Quote Sent',         color: 'text-blue-700',    bg: 'bg-blue-100',    description: 'Quote has been sent',           group: 'pre_event' },
  awaiting_deposit:     { label: 'Awaiting Deposit',   color: 'text-amber-700',   bg: 'bg-amber-100',   description: 'Waiting for deposit payment',   group: 'pre_event' },
  confirmed:            { label: 'Confirmed',          color: 'text-emerald-700', bg: 'bg-emerald-100', description: 'Order confirmed by customer',   group: 'pre_event' },
  inventory_reserved:   { label: 'Reserved',           color: 'text-teal-700',    bg: 'bg-teal-100',    description: 'Inventory has been reserved',   group: 'pre_event' },
  scheduled_for_dispatch: { label: 'Scheduled',        color: 'text-indigo-700',  bg: 'bg-indigo-100',  description: 'Scheduled for delivery',        group: 'pre_event' },
  out_for_delivery:     { label: 'Out for Delivery',   color: 'text-violet-700',  bg: 'bg-violet-100',  description: 'On the way to venue',           group: 'active' },
  setup_in_progress:    { label: 'Setup In Progress',  color: 'text-purple-700',  bg: 'bg-purple-100',  description: 'Setup underway at venue',       group: 'active' },
  event_active:         { label: 'Event Active',       color: 'text-pink-700',    bg: 'bg-pink-100',    description: 'Event is currently happening',  group: 'active' },
  pickup_scheduled:     { label: 'Pickup Scheduled',   color: 'text-orange-700',  bg: 'bg-orange-100',  description: 'Pickup has been scheduled',     group: 'post_event' },
  returned:             { label: 'Returned',           color: 'text-sky-700',     bg: 'bg-sky-100',     description: 'Items have been returned',      group: 'post_event' },
  inspection:           { label: 'Inspection',         color: 'text-yellow-700',  bg: 'bg-yellow-100',  description: 'Items being inspected',         group: 'post_event' },
  completed:            { label: 'Completed',          color: 'text-green-700',   bg: 'bg-green-100',   description: 'Order fully completed',         group: 'closed' },
  closed:               { label: 'Closed',             color: 'text-gray-600',    bg: 'bg-gray-100',    description: 'Order closed',                  group: 'closed' },
  cancelled:            { label: 'Cancelled',          color: 'text-red-700',     bg: 'bg-red-100',     description: 'Order cancelled',               group: 'closed' },
  refunded:             { label: 'Refunded',           color: 'text-red-700',     bg: 'bg-red-100',     description: 'Payment refunded',              group: 'closed' },
  partially_returned:   { label: 'Partial Return',     color: 'text-orange-700',  bg: 'bg-orange-100',  description: 'Some items returned',           group: 'post_event' },
  damaged:              { label: 'Damaged',            color: 'text-red-800',     bg: 'bg-red-200',     description: 'Damage reported',               group: 'post_event' },
  overdue:              { label: 'Overdue',            color: 'text-red-800',     bg: 'bg-red-200',     description: 'Past due return date',          group: 'post_event' },
}

// ============================================================
// INVOICE STATUS CONFIG
// ============================================================

export const INVOICE_STATUS_CONFIG: Record<InvoiceStatus, {
  label: string
  color: string
  bg: string
}> = {
  draft:    { label: 'Draft',    color: 'text-slate-600',   bg: 'bg-slate-100' },
  sent:     { label: 'Sent',     color: 'text-blue-700',    bg: 'bg-blue-100' },
  partial:  { label: 'Partial',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  paid:     { label: 'Paid',     color: 'text-emerald-700', bg: 'bg-emerald-100' },
  overdue:  { label: 'Overdue',  color: 'text-red-700',     bg: 'bg-red-100' },
  refunded: { label: 'Refunded', color: 'text-orange-700',  bg: 'bg-orange-100' },
  voided:   { label: 'Voided',   color: 'text-gray-600',    bg: 'bg-gray-100' },
}

// ============================================================
// DISPATCH STATUS CONFIG
// ============================================================

export const DISPATCH_STATUS_CONFIG: Record<DispatchStatus, {
  label: string
  color: string
  bg: string
}> = {
  scheduled:        { label: 'Scheduled',        color: 'text-blue-700',    bg: 'bg-blue-100' },
  loading:          { label: 'Loading',          color: 'text-amber-700',   bg: 'bg-amber-100' },
  out_for_delivery: { label: 'Out for Delivery', color: 'text-violet-700',  bg: 'bg-violet-100' },
  delivered:        { label: 'Delivered',        color: 'text-emerald-700', bg: 'bg-emerald-100' },
  setup_done:       { label: 'Setup Done',       color: 'text-teal-700',    bg: 'bg-teal-100' },
  pickup_pending:   { label: 'Pickup Pending',   color: 'text-orange-700',  bg: 'bg-orange-100' },
  returned:         { label: 'Returned',         color: 'text-green-700',   bg: 'bg-green-100' },
  cancelled:        { label: 'Cancelled',        color: 'text-red-700',     bg: 'bg-red-100' },
}

// ============================================================
// ASSET STATUS CONFIG
// ============================================================

export const ASSET_STATUS_CONFIG: Record<AssetStatus, {
  label: string
  color: string
  bg: string
}> = {
  available:    { label: 'Available',    color: 'text-emerald-700', bg: 'bg-emerald-100' },
  reserved:     { label: 'Reserved',     color: 'text-blue-700',    bg: 'bg-blue-100' },
  out:          { label: 'Out',          color: 'text-violet-700',  bg: 'bg-violet-100' },
  returned:     { label: 'Returning',    color: 'text-sky-700',     bg: 'bg-sky-100' },   // back in warehouse, pending inspection
  damaged:      { label: 'Damaged',      color: 'text-red-700',     bg: 'bg-red-100' },
  under_repair: { label: 'Maintenance',  color: 'text-amber-700',   bg: 'bg-amber-100' },
  retired:      { label: 'Retired',      color: 'text-gray-600',    bg: 'bg-gray-100' },
  lost:         { label: 'Lost',         color: 'text-red-900',     bg: 'bg-red-200' },
}

// ============================================================
// TRACKING MODE CONFIG
// ============================================================

export const TRACKING_MODE_CONFIG: Record<TrackingMode, {
  label: string
  description: string
  color: string
  bg: string
}> = {
  bulk:               { label: 'Bulk',              description: 'Quantity tracking only — no individual asset rows required', color: 'text-slate-600',  bg: 'bg-slate-100' },
  serialized:         { label: 'Serialized',        description: 'Each unit tracked individually with its own QR code',      color: 'text-indigo-700', bg: 'bg-indigo-100' },
  bundled_serialized: { label: 'Bundle-Serialized', description: 'Serialized units grouped into carts/bundles for dispatch', color: 'text-purple-700', bg: 'bg-purple-100' },
}

// ============================================================
// ASSET MOVEMENT LABELS
// ============================================================

export const ASSET_MOVEMENT_CONFIG: Record<AssetMovementType, {
  label: string
  color: string
  bg: string
}> = {
  assigned:        { label: 'Assigned',         color: 'text-blue-700',    bg: 'bg-blue-100' },
  unassigned:      { label: 'Unassigned',        color: 'text-slate-600',   bg: 'bg-slate-100' },
  checkout:        { label: 'Checked Out',       color: 'text-violet-700',  bg: 'bg-violet-100' },
  delivered:       { label: 'Delivered',         color: 'text-teal-700',    bg: 'bg-teal-100' },
  checkin:         { label: 'Checked In',        color: 'text-sky-700',     bg: 'bg-sky-100' },
  inspected:       { label: 'Inspected',         color: 'text-emerald-700', bg: 'bg-emerald-100' },
  damaged:         { label: 'Damaged',           color: 'text-red-700',     bg: 'bg-red-100' },
  maintenance_in:  { label: 'Maintenance In',    color: 'text-amber-700',   bg: 'bg-amber-100' },
  maintenance_out: { label: 'Maintenance Out',   color: 'text-green-700',   bg: 'bg-green-100' },
  retired:         { label: 'Retired',           color: 'text-gray-600',    bg: 'bg-gray-100' },
  located:         { label: 'Located',           color: 'text-slate-600',   bg: 'bg-slate-100' },
  status_change:   { label: 'Status Updated',    color: 'text-orange-700',  bg: 'bg-orange-100' },
}

// ============================================================
// INVENTORY CATEGORIES
// ============================================================

export const INVENTORY_CATEGORIES = [
  { value: 'chairs',   label: 'Chairs',    icon: '🪑' },
  { value: 'tables',   label: 'Tables',    icon: '🪵' },
  { value: 'canopies', label: 'Canopies',  icon: '⛱️' },
  { value: 'tents',    label: 'Tents',     icon: '⛺' },
  { value: 'decor',    label: 'Décor',     icon: '✨' },
  { value: 'utensils', label: 'Utensils',  icon: '🍴' },
  { value: 'linens',   label: 'Linens',    icon: '🛏️' },
  { value: 'other',    label: 'Other',     icon: '📦' },
]

// ============================================================
// EXPENSE CATEGORIES
// ============================================================

export const EXPENSE_CATEGORIES = [
  { value: 'labor',       label: 'Labor',       icon: '👷' },
  { value: 'fuel',        label: 'Fuel',         icon: '⛽' },
  { value: 'repair',      label: 'Repair',       icon: '🔧' },
  { value: 'supplies',    label: 'Supplies',     icon: '📦' },
  { value: 'transport',   label: 'Transport',    icon: '🚛' },
  { value: 'marketing',   label: 'Marketing',    icon: '📣' },
  { value: 'other',       label: 'Other',        icon: '💼' },
]

// ============================================================
// PAYMENT METHODS
// ============================================================

export const PAYMENT_METHODS = [
  { value: 'cash',          label: 'Cash' },
  { value: 'check',         label: 'Check' },
  { value: 'card',          label: 'Credit/Debit Card' },
  { value: 'venmo',         label: 'Venmo' },
  { value: 'zelle',         label: 'Zelle' },
  { value: 'paypal',        label: 'PayPal' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other',         label: 'Other' },
]

// ============================================================
// NAVIGATION
// ============================================================

export const NAV_ITEMS = [
  { href: '/',          label: 'Dashboard',  icon: 'LayoutDashboard' },
  { href: '/orders',    label: 'Orders',     icon: 'ClipboardList' },
  { href: '/calendar',  label: 'Calendar',   icon: 'Calendar' },
  { href: '/inventory', label: 'Inventory',  icon: 'Package' },
  { href: '/dispatch',  label: 'Dispatch',   icon: 'Truck' },
  { href: '/invoices',  label: 'Invoices',   icon: 'FileText' },
  { href: '/payments',  label: 'Payments',   icon: 'CreditCard' },
  { href: '/customers', label: 'Customers',  icon: 'Users' },
  { href: '/returns',   label: 'Returns',    icon: 'RotateCcw' },
  { href: '/damages',   label: 'Damages',    icon: 'AlertTriangle' },
  { href: '/expenses',  label: 'Expenses',   icon: 'Receipt' },
  { href: '/reports',   label: 'Reports',    icon: 'BarChart3' },
  { href: '/settings',  label: 'Settings',   icon: 'Settings' },
]

// ============================================================
// FORMATTING HELPERS
// ============================================================

export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}
