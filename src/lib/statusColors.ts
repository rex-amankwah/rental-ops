/**
 * Centralized status color mappings for RentalOps.
 *
 * Every status/severity/role badge, pill, and inline color in the app
 * should source its Tailwind classes from this file so changes propagate
 * everywhere from a single edit.
 *
 * Pattern: { label, bg, color } where bg + color are Tailwind class strings.
 * Helper functions return the combined class string "bg-X text-Y" for
 * use directly in className.
 */

import { DISPATCH_STATUS_CONFIG, ORDER_STATUS_CONFIG, INVOICE_STATUS_CONFIG, ASSET_STATUS_CONFIG, ASSET_MOVEMENT_CONFIG, TRACKING_MODE_CONFIG } from '@/lib/constants'
import type { DispatchStatus, OrderStatus, InvoiceStatus, AssetStatus, AssetMovementType, TrackingMode } from '@/types/database'

// ─── Fallback ─────────────────────────────────────────────────────────────────

const FALLBACK = { label: '—', bg: 'bg-muted', color: 'text-muted-foreground' }

function combinedClass(cfg: { bg: string; color: string }): string {
  return `${cfg.bg} ${cfg.color}`
}

function lookupClass(
  map: Record<string, { bg: string; color: string }>,
  key: string,
): string {
  return combinedClass(map[key] ?? FALLBACK)
}

// ─── Damage severity ──────────────────────────────────────────────────────────

export const DAMAGE_SEVERITY_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  minor:      { label: 'Minor',      bg: 'bg-amber-100',  color: 'text-amber-700' },
  moderate:   { label: 'Moderate',   bg: 'bg-orange-100', color: 'text-orange-700' },
  severe:     { label: 'Severe',     bg: 'bg-red-100',    color: 'text-red-700' },
  total_loss: { label: 'Total Loss', bg: 'bg-red-200',    color: 'text-red-900' },
}

export function getDamageSeverityClass(severity: string): string {
  return lookupClass(DAMAGE_SEVERITY_COLORS, severity)
}

// ─── Damage report status ─────────────────────────────────────────────────────

export const DAMAGE_STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  open:      { label: 'Open',      bg: 'bg-red-100',     color: 'text-red-700' },
  in_review: { label: 'In Review', bg: 'bg-amber-100',   color: 'text-amber-700' },
  resolved:  { label: 'Resolved',  bg: 'bg-emerald-100', color: 'text-emerald-700' },
  closed:    { label: 'Closed',    bg: 'bg-muted',       color: 'text-muted-foreground' },
}

export function getDamageStatusClass(status: string): string {
  return lookupClass(DAMAGE_STATUS_COLORS, status)
}

// ─── Return status ────────────────────────────────────────────────────────────

export const RETURN_STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-100',   color: 'text-amber-700' },
  completed: { label: 'Completed', bg: 'bg-emerald-100', color: 'text-emerald-700' },
  disputed:  { label: 'Disputed',  bg: 'bg-red-100',     color: 'text-red-700' },
}

export function getReturnStatusClass(status: string): string {
  return lookupClass(RETURN_STATUS_COLORS, status)
}

// ─── Payment type ─────────────────────────────────────────────────────────────

export const PAYMENT_TYPE_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  deposit:          { label: 'Deposit',          bg: 'bg-blue-100',    color: 'text-blue-700' },
  payment:          { label: 'Payment',          bg: 'bg-emerald-100', color: 'text-emerald-700' },
  partial_payment:  { label: 'Partial Payment',  bg: 'bg-teal-100',    color: 'text-teal-700' },
  refund:           { label: 'Refund',           bg: 'bg-red-100',     color: 'text-red-700' },
  security_deposit: { label: 'Security Deposit', bg: 'bg-blue-100',    color: 'text-blue-700' },
  security_refund:  { label: 'Security Refund',  bg: 'bg-red-100',     color: 'text-red-700' },
}

export function getPaymentTypeClass(paymentType: string): string {
  return lookupClass(PAYMENT_TYPE_COLORS, paymentType)
}

// ─── Expense category ─────────────────────────────────────────────────────────

export const EXPENSE_CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  labor:     { bg: 'bg-blue-100',   color: 'text-blue-700' },
  fuel:      { bg: 'bg-amber-100',  color: 'text-amber-700' },
  repair:    { bg: 'bg-orange-100', color: 'text-orange-700' },
  supplies:  { bg: 'bg-teal-100',   color: 'text-teal-700' },
  transport: { bg: 'bg-violet-100', color: 'text-violet-700' },
  marketing: { bg: 'bg-pink-100',   color: 'text-pink-700' },
  other:     { bg: 'bg-muted',      color: 'text-muted-foreground' },
}

export function getExpenseCategoryClass(category: string): string {
  return lookupClass(EXPENSE_CATEGORY_COLORS, category)
}

// ─── App role (4-role system: platform_admin / manager / staff / viewer) ─────

export const ROLE_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  platform_admin: { label: 'Platform Admin', bg: 'bg-purple-100', color: 'text-purple-800' },
  manager:        { label: 'Manager',        bg: 'bg-violet-100', color: 'text-violet-700' },
  staff:          { label: 'Staff',          bg: 'bg-blue-100',   color: 'text-blue-700' },
  viewer:         { label: 'Viewer',         bg: 'bg-slate-100',  color: 'text-slate-600' },
}

/**
 * Raw DB role values → normalized AppRole key for ROLE_COLORS lookup.
 * Keeps any code still passing raw DB values working correctly.
 */
export const ROLE_ALIAS: Record<string, string> = {
  owner:  'platform_admin',  // DB 'owner'  → Platform Admin
  admin:  'manager',         // DB 'admin'  → Manager (backward compat)
  driver: 'staff',
  // 'customer' intentionally omitted — not an internal operations role
}

export function getRoleClass(role: string): string {
  const normalized = ROLE_ALIAS[role] ?? role
  return lookupClass(ROLE_COLORS, normalized)
}

// ─── Payment record status ────────────────────────────────────────────────────

export const PAYMENT_STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-amber-100',   color: 'text-amber-700' },
  completed: { label: 'Completed', bg: 'bg-emerald-100', color: 'text-emerald-700' },
  failed:    { label: 'Failed',    bg: 'bg-red-100',     color: 'text-red-700' },
  refunded:  { label: 'Refunded',  bg: 'bg-red-100',     color: 'text-red-700' },
  voided:    { label: 'Voided',    bg: 'bg-muted',       color: 'text-muted-foreground' },
}

export function getPaymentStatusClass(status: string): string {
  return lookupClass(PAYMENT_STATUS_COLORS, status)
}

// ─── Order item reservation status ───────────────────────────────────────────

export const RESERVATION_STATUS_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  pending:   { label: 'Pending',   bg: 'bg-muted',       color: 'text-muted-foreground' },
  reserved:  { label: 'Reserved',  bg: 'bg-blue-100',    color: 'text-blue-700' },
  confirmed: { label: 'Confirmed', bg: 'bg-teal-100',    color: 'text-teal-700' },
  out:       { label: 'Out',       bg: 'bg-violet-100',  color: 'text-violet-700' },
  returned:  { label: 'Returned',  bg: 'bg-emerald-100', color: 'text-emerald-700' },
  cancelled: { label: 'Cancelled', bg: 'bg-muted',       color: 'text-muted-foreground' },
}

export function getReservationStatusClass(status: string): string {
  return lookupClass(RESERVATION_STATUS_COLORS, status)
}

// ─── Inventory tracking type ──────────────────────────────────────────────────

export const TRACKING_TYPE_COLORS: Record<string, { label: string; bg: string; color: string }> = {
  serialized: { label: 'Serialized', bg: 'bg-indigo-100', color: 'text-indigo-700' },
  bulk:       { label: 'Bulk',       bg: 'bg-slate-100',  color: 'text-slate-600' },
  hybrid:     { label: 'Hybrid',     bg: 'bg-purple-100', color: 'text-purple-700' },
}

export function getTrackingTypeClass(type: string): string {
  return lookupClass(TRACKING_TYPE_COLORS, type)
}

// ─── Order status helpers (proxy to canonical ORDER_STATUS_CONFIG) ────────────

export function getOrderStatusClass(status: string): string {
  const cfg = ORDER_STATUS_CONFIG[status as OrderStatus]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_CONFIG[status as OrderStatus]?.label ?? status
}

// ─── Invoice status helpers (proxy to canonical INVOICE_STATUS_CONFIG) ────────

export function getInvoiceStatusClass(status: string): string {
  const cfg = INVOICE_STATUS_CONFIG[status as InvoiceStatus]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

export function getInvoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_CONFIG[status as InvoiceStatus]?.label ?? status
}

// ─── Dispatch stage helper ────────────────────────────────────────────────────
// Colors sourced from the canonical DISPATCH_STATUS_CONFIG in constants.ts.

export function getDispatchStageClass(stage: string): string {
  const cfg = DISPATCH_STATUS_CONFIG[stage as DispatchStatus]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

// ─── Dispatch badge for the orders list table ─────────────────────────────────
// Colors from DISPATCH_STATUS_CONFIG; labels overridden for orders-table context.

const DISPATCH_LABEL_OVERRIDES: Partial<Record<DispatchStatus, string>> = {
  loading:    'On Board',
  setup_done: 'Delivered',
}

export const ORDER_DISPATCH_BADGE: Record<string, { label: string; bg: string; color: string }> = (
  Object.keys(DISPATCH_STATUS_CONFIG) as DispatchStatus[]
).reduce<Record<string, { label: string; bg: string; color: string }>>((acc, stage) => {
  const { label, bg, color } = DISPATCH_STATUS_CONFIG[stage]
  acc[stage] = {
    label: DISPATCH_LABEL_OVERRIDES[stage] ?? label,
    bg,
    color,
  }
  return acc
}, {})

// ─── Bonus: inventory low-stock threshold ─────────────────────────────────────

// ─── Asset status helpers ─────────────────────────────────────────────────────

export function getAssetStatusClass(status: string): string {
  const cfg = ASSET_STATUS_CONFIG[status as AssetStatus]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

export function getAssetStatusLabel(status: string): string {
  return ASSET_STATUS_CONFIG[status as AssetStatus]?.label ?? status
}

// ─── Asset movement helpers ───────────────────────────────────────────────────

export function getMovementTypeClass(type: string): string {
  const cfg = ASSET_MOVEMENT_CONFIG[type as AssetMovementType]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

export function getMovementTypeLabel(type: string): string {
  return ASSET_MOVEMENT_CONFIG[type as AssetMovementType]?.label ?? type
}

// ─── Tracking mode helpers ────────────────────────────────────────────────────

export function getTrackingModeClass(mode: string): string {
  const cfg = TRACKING_MODE_CONFIG[mode as TrackingMode]
  return cfg ? combinedClass(cfg) : combinedClass(FALLBACK)
}

export function getTrackingModeLabel(mode: string): string {
  return TRACKING_MODE_CONFIG[mode as TrackingMode]?.label ?? mode
}

/** Items with quantity_available below this number are considered low-stock. */
export const LOW_STOCK_THRESHOLD = 3

export function getLowStockClass(available: number, owned: number): string {
  if (owned === 0) return ''
  if (available === 0) return 'text-red-600 font-semibold'
  if (available < LOW_STOCK_THRESHOLD) return 'text-amber-600 font-medium'
  return ''
}
