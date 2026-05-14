// ============================================================
// Database types — auto-kept in sync with schema
// ============================================================
import type { ReactNode } from 'react'

/** Legacy DB role values — kept for reference only. App code uses AppRole. */
export type UserRole = 'owner' | 'admin' | 'manager' | 'staff' | 'driver' | 'customer'

/** Normalized 3-role system used throughout the app. */
export type AppRole = 'admin' | 'staff' | 'viewer'

export type OrderStatus =
  | 'inquiry' | 'quote_sent' | 'awaiting_deposit' | 'confirmed'
  | 'inventory_reserved' | 'scheduled_for_dispatch'
  | 'out_for_delivery' | 'setup_in_progress' | 'event_active'
  | 'pickup_scheduled' | 'returned' | 'inspection' | 'completed'
  | 'closed' | 'cancelled' | 'refunded' | 'partially_returned'
  | 'damaged' | 'overdue'

export type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'refunded' | 'voided'

export type PaymentType = 'deposit' | 'payment' | 'partial_payment' | 'refund' | 'security_deposit' | 'security_refund'

export type PaymentMethod = 'cash' | 'check' | 'card' | 'venmo' | 'zelle' | 'paypal' | 'bank_transfer' | 'other'

export type DispatchStatus =
  | 'scheduled' | 'loading' | 'out_for_delivery' | 'delivered'
  | 'setup_done' | 'pickup_pending' | 'returned' | 'cancelled'

export type TrackingType = 'serialized' | 'bulk'

export type AssetStatus = 'available' | 'reserved' | 'out' | 'damaged' | 'under_repair' | 'retired' | 'lost'

export type InventoryCategory = 'chairs' | 'tables' | 'canopies' | 'tents' | 'decor' | 'utensils' | 'linens' | 'other'

// ============================================================
// Core table types
// ============================================================

export interface Company {
  id: string
  name: string
  slug: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  country: string
  logo_url: string | null
  timezone: string
  currency: string
  tax_rate: number
  default_rental_days: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  company_id: string
  email: string
  full_name: string | null
  phone: string | null
  avatar_url: string | null
  role: AppRole
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface Customer {
  id: string
  company_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  phone_alt: string | null
  company_name: string | null
  billing_address: string | null
  billing_city: string | null
  billing_state: string | null
  billing_zip: string | null
  notes: string | null
  tags: string[] | null
  source: string | null
  total_orders: number
  total_spent: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface InventoryCatalogItem {
  id: string
  company_id: string
  name: string
  sku: string | null
  category: InventoryCategory
  description: string | null
  tracking_type: TrackingType
  rental_rate: number
  replacement_cost: number
  quantity_owned: number
  quantity_available: number
  quantity_reserved: number
  quantity_out: number
  quantity_damaged: number
  quantity_under_repair: number
  warehouse_location: string | null
  image_url: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface InventoryAsset {
  id: string
  company_id: string
  catalog_item_id: string
  asset_code: string
  qr_code_value: string | null
  status: AssetStatus
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'damaged'
  warehouse_location: string | null
  purchase_date: string | null
  purchase_price: number | null
  last_scanned_at: string | null
  last_scanned_by: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RentalOrder {
  id: string
  company_id: string
  order_number: string
  customer_id: string | null
  status: OrderStatus
  event_name: string | null
  event_type: string | null
  event_date: string | null
  event_end_date: string | null
  event_start_time: string | null
  event_end_time: string | null
  guest_count: number | null
  venue_name: string | null
  venue_address: string | null
  venue_city: string | null
  venue_state: string | null
  venue_zip: string | null
  venue_notes: string | null
  delivery_date: string | null
  delivery_time: string | null
  pickup_date: string | null
  pickup_time: string | null
  rental_days: number
  subtotal: number
  delivery_fee: number
  setup_fee: number
  discount_amount: number
  tax_amount: number
  total_amount: number
  deposit_required: number
  deposit_paid: number
  amount_paid: number
  balance_due: number
  assigned_to: string | null
  sales_rep_id: string | null
  source: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  internal_notes: string | null
  customer_notes: string | null
  tags: string[] | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  customer?: Customer
}

export interface OrderItem {
  id: string
  company_id: string
  order_id: string
  catalog_item_id: string | null
  item_name_snapshot: string
  item_sku_snapshot: string | null
  category_snapshot: string | null
  quantity: number
  unit_rate: number
  rental_days: number
  line_total: number
  reservation_status: 'pending' | 'reserved' | 'confirmed' | 'out' | 'returned' | 'cancelled'
  fulfilled_quantity: number
  cancelled_quantity: number
  returned_quantity: number
  damaged_quantity: number
  missing_quantity: number
  notes: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Invoice {
  id: string
  company_id: string
  invoice_number: string
  order_id: string | null
  customer_id: string | null
  status: InvoiceStatus
  subtotal: number
  delivery_fee: number
  setup_fee: number
  discount: number
  tax_rate: number
  tax_amount: number
  security_deposit: number
  total: number
  amount_paid: number
  balance_due: number
  issue_date: string
  due_date: string | null
  sent_at: string | null
  paid_at: string | null
  notes: string | null
  footer_text: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  // Joined
  customer?: Customer
  order?: RentalOrder
  items?: InvoiceItem[]
}

export interface InvoiceItem {
  id: string
  company_id: string
  invoice_id: string
  order_item_id: string | null
  description: string
  quantity: number
  unit_rate: number
  rental_days: number
  line_total: number
  sort_order: number
  created_at: string
}

export interface Payment {
  id: string
  company_id: string
  order_id: string | null
  invoice_id: string | null
  customer_id: string | null
  payment_type: PaymentType
  method: PaymentMethod
  status: 'pending' | 'completed' | 'failed' | 'refunded' | 'voided'
  amount: number
  reference: string | null
  notes: string | null
  payment_date: string
  processed_by: string | null
  created_at: string
  updated_at: string
  // Joined
  customer?: Customer
  order?: Pick<RentalOrder, 'id' | 'order_number' | 'event_name'>
  invoice?: Pick<Invoice, 'id' | 'invoice_number'>
}

export interface Dispatch {
  id: string
  company_id: string
  order_id: string
  dispatch_type: 'delivery' | 'pickup' | 'both'
  status: DispatchStatus
  driver_id: string | null
  vehicle_id: string | null
  crew_ids: string[] | null
  scheduled_delivery_date: string | null
  scheduled_delivery_time: string | null
  scheduled_pickup_date: string | null
  scheduled_pickup_time: string | null
  actual_delivery_at: string | null
  actual_pickup_at: string | null
  delivery_address: string | null
  delivery_city: string | null
  delivery_state: string | null
  delivery_zip: string | null
  contact_name: string | null
  contact_phone: string | null
  delivery_notes: string | null
  pickup_notes: string | null
  route_notes: string | null
  delivery_signature_url: string | null
  delivery_photo_url: string | null
  created_at: string
  updated_at: string
}

export interface ActivityLog {
  id: string
  company_id: string
  order_id: string | null
  actor_id: string | null
  actor_name: string | null
  entity_type: string
  entity_id: string | null
  action: string
  description: string
  old_value: Record<string, unknown> | null
  new_value: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ============================================================
// Utility/UI types
// ============================================================

export interface KpiCard {
  label: string
  value: string | number
  change?: string
  trend?: 'up' | 'down' | 'neutral'
  icon: string
  color: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'slate'
}

export interface TableColumn<T> {
  key: keyof T | string
  label: string
  render?: (row: T) => ReactNode
  sortable?: boolean
  width?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
}

export interface FilterState {
  search: string
  status: string
  dateFrom: string
  dateTo: string
  [key: string]: string
}
