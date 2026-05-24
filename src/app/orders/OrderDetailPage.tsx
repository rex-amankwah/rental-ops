import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Calendar, Package, FileText,
  CreditCard, Clock, User, Phone, Mail, AlertTriangle, Truck,
  Loader2, CheckCircle2, Pencil, Boxes, ScanLine, QrCode, X
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAvailability } from '@/hooks/useAvailability'
import { StatusBadge, PriorityBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate, ORDER_STATUS_CONFIG } from '@/lib/constants'
import { RESERVATION_STATUS_COLORS, getReservationStatusClass, PAYMENT_STATUS_COLORS, getPaymentStatusClass } from '@/lib/statusColors'
import { canEdit } from '@/lib/roles'
import type { RentalOrder, Customer, OrderItem, Invoice, Payment, ActivityLog, AssetBundle, OrderItemAsset } from '@/types/database'
import Modal from '@/components/common/Modal'
import { getAssetStatusClass, getAssetStatusLabel } from '@/lib/statusColors'

type FullOrder = RentalOrder & {
  customer: Customer | null
  order_items: OrderItem[]
  invoices: Invoice[]
  payments: Payment[]
  activity_logs: ActivityLog[]
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, appRole } = useAuth()
  const { reserveItems, releaseReservations } = useAvailability()
  const [order, setOrder] = useState<FullOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'invoices' | 'payments' | 'activity' | 'assets'>('details')

  // Asset tracking state
  const [orderItemAssets, setOrderItemAssets] = useState<(OrderItemAsset & { bundle: AssetBundle | null })[]>([])
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [attachModalOpen, setAttachModalOpen] = useState(false)
  const [attachOrderItemId, setAttachOrderItemId] = useState<string | null>(null)
  const [availableBundles, setAvailableBundles] = useState<AssetBundle[]>([])
  const [attachingBundleId, setAttachingBundleId] = useState<string | null>(null)
  const [attachError, setAttachError] = useState<string | null>(null)
  const [reserving, setReserving] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeDispatch, setActiveDispatch] = useState<{ id: string; status: string } | null>(null)

  const fetchOrder = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    setNotFound(false)
    setFetchError(null)
    try {
      const [orderResult, dispatchResult] = await Promise.all([
        supabase
          .from('rental_orders')
          .select(`
            *,
            customer:customers(*),
            order_items(*),
            invoices(*),
            payments(*),
            activity_logs(*)
          `)
          .eq('id', id)
          .single(),
        supabase
          .from('dispatches')
          .select('id,status')
          .eq('order_id', id)
          .neq('status', 'cancelled')
          .limit(1)
          .maybeSingle(),
      ])

      if (orderResult.error) {
        if (orderResult.error.code === 'PGRST116' || orderResult.error.message?.includes('0 rows')) {
          setNotFound(true)
        } else {
          console.error('[OrderDetailPage] fetch error:', orderResult.error)
          setFetchError(`${orderResult.error.message} (${orderResult.error.code})`)
        }
        return
      }
      setOrder(orderResult.data as unknown as FullOrder)
      setActiveDispatch(dispatchResult.data ?? null)
    } catch (err) {
      console.error('[OrderDetailPage] unexpected error:', err)
      setFetchError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { fetchOrder() }, [fetchOrder])

  // Lazy-fetch order item assets only when assets tab is opened
  useEffect(() => {
    if (activeTab !== 'assets' || !id || !profile?.company_id) return
    async function fetchAssets() {
      setAssetsLoading(true)
      try {
        const { data } = await supabase
          .from('order_item_assets')
          .select('*, bundle:asset_bundles(*)')
          .eq('order_id', id)
          .eq('company_id', profile!.company_id)
          .is('unassigned_at', null)
          .order('assigned_at', { ascending: true })
        setOrderItemAssets((data ?? []) as (OrderItemAsset & { bundle: AssetBundle | null })[])
      } finally {
        setAssetsLoading(false)
      }
    }
    fetchAssets()
  }, [activeTab, id, profile?.company_id])

  async function openAttachModal(orderItemId: string) {
    if (!profile?.company_id) return
    setAttachOrderItemId(orderItemId)
    setAttachError(null)
    setAttachModalOpen(true)
    const { data } = await supabase
      .from('asset_bundles')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_active', true)
      .order('bundle_code')
    setAvailableBundles((data ?? []) as AssetBundle[])
  }

  async function attachBundle(bundleId: string) {
    if (!id || !attachOrderItemId || !profile?.company_id || !profile?.id) return
    setAttachingBundleId(bundleId)
    setAttachError(null)
    try {
      // Get all active bundle members to create order_item_asset rows
      const { data: members, error: mErr } = await supabase
        .from('asset_bundle_members')
        .select('asset_id')
        .eq('bundle_id', bundleId)
        .eq('company_id', profile.company_id)
        .is('removed_at', null)
      if (mErr) throw mErr

      const rows = (members ?? []).map((m) => ({
        company_id:    profile!.company_id,
        order_id:      id,
        order_item_id: attachOrderItemId,
        asset_id:      m.asset_id,
        bundle_id:     bundleId,
        assigned_by:   profile!.id,
      }))

      if (rows.length === 0) {
        setAttachError('This bundle has no active member assets.')
        return
      }

      const { error: insertErr } = await supabase.from('order_item_assets').insert(rows)
      if (insertErr) throw insertErr

      setAttachModalOpen(false)
      setAttachOrderItemId(null)

      // Refresh assets tab
      const { data: refreshed } = await supabase
        .from('order_item_assets')
        .select('*, bundle:asset_bundles(*)')
        .eq('order_id', id)
        .eq('company_id', profile.company_id)
        .is('unassigned_at', null)
        .order('assigned_at', { ascending: true })
      setOrderItemAssets((refreshed ?? []) as (OrderItemAsset & { bundle: AssetBundle | null })[])
    } catch (err: unknown) {
      setAttachError(err instanceof Error ? err.message : 'Failed to attach bundle')
    } finally {
      setAttachingBundleId(null)
    }
  }

  async function detachAsset(assetId: string) {
    if (!profile?.company_id || !profile?.id) return
    await supabase
      .from('order_item_assets')
      .update({ unassigned_at: new Date().toISOString(), unassigned_by: profile.id })
      .eq('order_id', id)
      .eq('asset_id', assetId)
      .eq('company_id', profile.company_id)
      .is('unassigned_at', null)
    setOrderItemAssets((prev) => prev.filter((a) => a.asset_id !== assetId))
  }

  async function handleReserve(override = false) {
    if (!order) return
    setReserving(true); setActionError(null)
    const { success, error } = await reserveItems(order.id, override)
    if (!success) setActionError(error ?? 'Reservation failed')
    else await fetchOrder()
    setReserving(false)
  }

  async function handleRelease() {
    if (!order) return
    if (!confirm('Release all inventory reservations for this order?')) return
    setReserving(true); setActionError(null)
    const { success, error } = await releaseReservations(order.id)
    if (!success) setActionError(error ?? 'Release failed')
    else await fetchOrder()
    setReserving(false)
  }

  async function handleGenerateInvoice() {
    if (!order || !profile?.id) return
    setInvoicing(true); setActionError(null)
    try {
      const { data, error } = await supabase.rpc('generate_invoice_from_order', {
        p_order_id: order.id,
        p_actor_id: profile.id,
      })
      if (error) throw error
      navigate(`/invoices/${data}`)
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Failed to generate invoice')
      setInvoicing(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="skeleton w-40 h-6" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-32 rounded-xl" />)}
        </div>
        <div className="skeleton h-64 rounded-xl" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Failed to load order</h2>
        <p className="text-sm text-red-600 mb-2 font-mono max-w-sm break-all">{fetchError}</p>
        <p className="text-xs text-muted-foreground mb-6">Check the browser console for details.</p>
        <div className="flex gap-3">
          <button onClick={() => fetchOrder()} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/orders')} className="btn-secondary">Back to Orders</button>
        </div>
      </div>
    )
  }

  if (notFound || !order) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Package className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Order not found</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          This order doesn't exist or you don't have access to it.
        </p>
        <button onClick={() => navigate('/orders')} className="btn-primary">
          Back to Orders
        </button>
      </div>
    )
  }

  const customer = order.customer as unknown as Customer | null

  const TABS = [
    { key: 'details',  label: 'Details',   count: null },
    { key: 'items',    label: 'Items',     count: order.order_items?.length ?? 0 },
    { key: 'invoices', label: 'Invoices',  count: order.invoices?.length ?? 0 },
    { key: 'payments', label: 'Payments',  count: order.payments?.length ?? 0 },
    { key: 'activity', label: 'Activity',  count: order.activity_logs?.length ?? 0 },
    { key: 'assets',   label: 'Assets',    count: null },
  ] as const

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/orders')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold font-mono">{order.order_number}</h1>
            <StatusBadge type="order" status={order.status} />
            {order.priority !== 'normal' && <PriorityBadge priority={order.priority} />}
          </div>
          {order.event_name && (
            <p className="text-sm text-muted-foreground mt-0.5">{order.event_name}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Edit order — staff/admin only */}
          {canEdit(appRole) && !['cancelled', 'refunded', 'closed', 'completed'].includes(order.status) && (
            <button onClick={() => navigate(`/orders/${order.id}/edit`)} className="btn-secondary">
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {/* Reserve inventory — staff/admin only */}
          {canEdit(appRole) && order.order_items?.length > 0 && ['confirmed','awaiting_deposit','quote_sent','inquiry'].includes(order.status) && (
            <button onClick={() => handleReserve(false)} disabled={reserving} className="btn-primary">
              {reserving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Reserve Inventory
            </button>
          )}
          {/* Release reservation — staff/admin only */}
          {canEdit(appRole) && order.status === 'inventory_reserved' && (
            <button onClick={handleRelease} disabled={reserving} className="btn-secondary">
              {reserving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Release Reservation
            </button>
          )}
          {/* Generate invoice — staff/admin only */}
          {canEdit(appRole) && order.order_items?.length > 0 && !['cancelled','refunded','closed'].includes(order.status) && (
            <button onClick={handleGenerateInvoice} disabled={invoicing} className="btn-secondary">
              {invoicing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Generate Invoice
            </button>
          )}
          {/* Dispatch: View Dispatch is read-only (all roles); Send to Dispatch is staff/admin only */}
          {activeDispatch ? (
            <button onClick={() => navigate('/dispatch')} className="btn-secondary">
              <Truck className="w-3.5 h-3.5" />
              View Dispatch
            </button>
          ) : canEdit(appRole) && ['confirmed', 'inventory_reserved', 'awaiting_deposit'].includes(order.status) && (
            <button onClick={() => navigate(`/dispatch/new?orderId=${order.id}`)} className="btn-primary">
              <Truck className="w-3.5 h-3.5" />
              Send to Dispatch
            </button>
          )}
        </div>
      </div>

      {/* Status progress bar */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 flex-wrap">
          {['inquiry','confirmed','inventory_reserved','out_for_delivery','event_active','returned','completed'].map((s, i, arr) => {
            const cfg = ORDER_STATUS_CONFIG[s as keyof typeof ORDER_STATUS_CONFIG]
            const currentIdx = arr.indexOf(order.status)
            const thisIdx = i
            const isPast = thisIdx < currentIdx
            const isCurrent = s === order.status || (currentIdx === -1 && i === 0)

            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  isCurrent ? `${cfg.bg} ${cfg.color} ring-2 ring-offset-1 ring-current` :
                  isPast ? 'bg-emerald-100 text-emerald-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isPast && <span>✓</span>}
                  {cfg.label}
                </div>
                {i < arr.length - 1 && (
                  <div className={`h-px w-4 ${isPast ? 'bg-emerald-400' : 'bg-border'}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer card */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" />
            Customer
          </h3>
          {customer ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                {customer.first_name} {customer.last_name}
              </p>
              {customer.company_name && (
                <p className="text-xs text-muted-foreground">{customer.company_name}</p>
              )}
              {customer.phone && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Phone className="w-3 h-3" />
                  {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3" />
                  {customer.email}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No customer assigned</p>
          )}
        </div>

        {/* Event card */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5" />
            Event Details
          </h3>
          <div className="space-y-1.5">
            {order.event_date && (
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground">{formatDate(order.event_date)}</p>
              </div>
            )}
            {order.guest_count && (
              <p className="text-xs text-muted-foreground">{order.guest_count.toLocaleString()} guests</p>
            )}
            {(order.venue_name || order.venue_city) && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{order.venue_name}{order.venue_city ? `, ${order.venue_city}` : ''}</span>
              </div>
            )}
            <div className="pt-1 border-t border-border mt-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Truck className="w-3 h-3" />
                <span>Delivery: {formatDate(order.delivery_date)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Clock className="w-3 h-3" />
                <span>Pickup: {formatDate(order.pickup_date)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial card */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" />
            Financials
          </h3>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(order.subtotal)}</span>
            </div>
            {order.delivery_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                <span>{formatCurrency(order.delivery_fee)}</span>
              </div>
            )}
            {order.setup_fee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Setup</span>
                <span>{formatCurrency(order.setup_fee)}</span>
              </div>
            )}
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-sm text-emerald-600">
                <span>Discount</span>
                <span>-{formatCurrency(order.discount_amount)}</span>
              </div>
            )}
            {order.tax_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span>{formatCurrency(order.tax_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-semibold pt-1.5 border-t border-border">
              <span>Total</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Paid</span>
              <span>{formatCurrency(order.amount_paid)}</span>
            </div>
            {order.balance_due > 0 && (
              <div className="flex justify-between text-sm font-semibold text-red-600">
                <span>Balance Due</span>
                <span>{formatCurrency(order.balance_due)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className="badge bg-muted text-muted-foreground text-[10px] px-1.5 py-0">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {/* Details tab */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Order Information</h4>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Event Type', order.event_type || '—'],
                    ['Rental Days', order.rental_days],
                    ['Source', order.source || '—'],
                    ['Tags', order.tags?.join(', ') || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex gap-3">
                      <dt className="w-28 text-muted-foreground flex-shrink-0">{k}</dt>
                      <dd className="text-foreground">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">Venue Details</h4>
                <dl className="space-y-2 text-sm">
                  {[
                    ['Venue', order.venue_name || '—'],
                    ['Address', order.venue_address || '—'],
                    ['City', order.venue_city || '—'],
                    ['State', order.venue_state || '—'],
                    ['Notes', order.venue_notes || '—'],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex gap-3">
                      <dt className="w-28 text-muted-foreground flex-shrink-0">{k}</dt>
                      <dd className="text-foreground">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="md:col-span-2 space-y-2">
                <div className="alert alert-info">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-xs">Internal Notes</p>
                    <p className="text-xs mt-0.5">{order.internal_notes || <span className="italic text-muted-foreground">None</span>}</p>
                  </div>
                </div>
                <div className="alert alert-info">
                  <User className="w-4 h-4 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-xs">Customer Notes</p>
                    <p className="text-xs mt-0.5">{order.customer_notes || <span className="italic text-muted-foreground">None</span>}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Items tab */}
          {activeTab === 'items' && (
            <div>
              {(!order.order_items || order.order_items.length === 0) ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Package className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No items added to this order yet</p>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Rate</th>
                        <th className="text-right">Days</th>
                        <th className="text-right">Total</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.order_items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <p className="text-sm font-medium text-foreground">{item.item_name_snapshot}</p>
                            {item.item_sku_snapshot && (
                              <p className="text-xs text-muted-foreground font-mono">{item.item_sku_snapshot}</p>
                            )}
                          </td>
                          <td className="text-right text-sm">{item.quantity}</td>
                          <td className="text-right text-sm">{formatCurrency(item.unit_rate)}</td>
                          <td className="text-right text-sm">{item.rental_days}</td>
                          <td className="text-right text-sm font-medium">{formatCurrency(item.line_total)}</td>
                          <td>
                            <span className={`badge text-xs ${getReservationStatusClass(item.reservation_status)}`}>
                              {RESERVATION_STATUS_COLORS[item.reservation_status]?.label ?? item.reservation_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="text-right text-sm font-semibold text-muted-foreground">Total</td>
                        <td className="text-right text-sm font-bold">{formatCurrency(order.total_amount)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Invoices tab */}
          {activeTab === 'invoices' && (
            <div>
              {(!order.invoices || order.invoices.length === 0) ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <FileText className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No invoices for this order</p>
                  <button onClick={handleGenerateInvoice} disabled={invoicing} className="btn-primary mt-4">
                    {invoicing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                    Generate Invoice
                  </button>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Invoice #</th>
                        <th>Issue Date</th>
                        <th>Due Date</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Paid</th>
                        <th className="text-right">Balance</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.invoices.map((inv) => (
                        <tr key={inv.id} onClick={() => navigate(`/invoices/${inv.id}`)} className="cursor-pointer">
                          <td className="font-mono text-xs font-medium text-primary">{inv.invoice_number}</td>
                          <td className="text-sm text-muted-foreground">{formatDate(inv.issue_date)}</td>
                          <td className="text-sm text-muted-foreground">{formatDate(inv.due_date)}</td>
                          <td className="text-right text-sm font-medium">{formatCurrency(inv.total)}</td>
                          <td className="text-right text-sm text-emerald-600">{formatCurrency(inv.amount_paid)}</td>
                          <td className="text-right text-sm text-red-600">{formatCurrency(inv.balance_due)}</td>
                          <td><StatusBadge type="invoice" status={inv.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Payments tab */}
          {activeTab === 'payments' && (
            <div>
              {(!order.payments || order.payments.length === 0) ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <CreditCard className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No payments recorded for this order</p>
                  <p className="text-xs text-muted-foreground mt-1">Generate an invoice to record payments.</p>
                </div>
              ) : (
                <div className="bg-card rounded-xl border border-border overflow-hidden">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.payments.map((pmt) => (
                        <tr key={pmt.id}>
                          <td className="text-sm text-muted-foreground">{formatDate(pmt.payment_date)}</td>
                          <td className="text-sm capitalize">{pmt.payment_type.replace('_', ' ')}</td>
                          <td className="text-sm capitalize">{pmt.method}</td>
                          <td className="text-xs font-mono text-muted-foreground">{pmt.reference || '—'}</td>
                          <td className={`text-right text-sm font-medium ${pmt.payment_type === 'refund' ? 'text-red-600' : 'text-emerald-600'}`}>
                            {pmt.payment_type === 'refund' ? '-' : ''}{formatCurrency(pmt.amount)}
                          </td>
                          <td>
                            <span className={`badge text-xs ${getPaymentStatusClass(pmt.status)}`}>
                              {PAYMENT_STATUS_COLORS[pmt.status]?.label ?? pmt.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Assets tab */}
          {activeTab === 'assets' && (
            <div className="space-y-4">
              {/* Quick actions bar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => navigate('/assets/scan')} className="btn-secondary">
                  <ScanLine className="w-4 h-4" /> Open Scanner
                </button>
                <button onClick={() => navigate('/assets/bundles')} className="btn-ghost">
                  <Boxes className="w-4 h-4" /> Manage Bundles
                </button>
              </div>

              {assetsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Per order_item: show assigned assets */}
                  {(order.order_items ?? []).map((item) => {
                    const itemAssets = orderItemAssets.filter((a) => a.order_item_id === item.id)
                    // Unique bundles for this item
                    const bundles = Array.from(
                      new Map(itemAssets.filter((a) => a.bundle).map((a) => [a.bundle_id, a.bundle])).values()
                    ) as AssetBundle[]

                    return (
                      <div key={item.id} className="bg-card border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.item_name_snapshot}</p>
                            <p className="text-xs text-muted-foreground">
                              Qty: {item.quantity} · {itemAssets.length} asset{itemAssets.length !== 1 ? 's' : ''} assigned
                            </p>
                          </div>
                          {canEdit(appRole) && (
                            <button
                              onClick={() => openAttachModal(item.id)}
                              className="btn-secondary text-xs py-1.5 px-3"
                            >
                              <Boxes className="w-3.5 h-3.5" /> Attach Bundle
                            </button>
                          )}
                        </div>

                        {itemAssets.length === 0 ? (
                          <div className="px-4 py-4 text-center">
                            <p className="text-xs text-muted-foreground">No assets assigned to this line item</p>
                          </div>
                        ) : (
                          <div>
                            {/* Bundle summary rows */}
                            {bundles.map((b) => b && (
                              <div key={b.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0">
                                <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                  <QrCode className="w-3.5 h-3.5 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium font-mono text-foreground">{b.bundle_code}</p>
                                  <p className="text-xs text-muted-foreground">{b.name} · {itemAssets.filter((a) => a.bundle_id === b.id).length} assets</p>
                                </div>
                                <button
                                  onClick={() => navigate(`/assets/bundles/${b.id}`)}
                                  className="btn-ghost text-xs py-1 px-2"
                                >
                                  View
                                </button>
                              </div>
                            ))}
                            {/* Individual assets not in a bundle */}
                            {itemAssets.filter((a) => !a.bundle_id).map((a) => (
                              <div key={a.id} className="flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-b-0">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-mono text-muted-foreground">{a.asset_id}</p>
                                </div>
                                <span className={`badge text-xs ${getAssetStatusClass(a.asset?.status ?? '')}`}>
                                  {getAssetStatusLabel(a.asset?.status ?? '')}
                                </span>
                                {canEdit(appRole) && (
                                  <button onClick={() => detachAsset(a.asset_id)} className="btn-ghost p-1.5 text-muted-foreground hover:text-red-600">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {order.order_items?.length === 0 && (
                    <div className="empty-state">
                      <div className="empty-state-icon">
                        <Boxes className="w-7 h-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">Add items to this order first</p>
                    </div>
                  )}
                </div>
              )}

              {/* Attach bundle modal */}
              <Modal
                open={attachModalOpen}
                onClose={() => { setAttachModalOpen(false); setAttachError(null) }}
                title="Attach Bundle"
                subtitle="Select a bundle to assign to this order line"
                size="md"
                allowBackdropClose
              >
                <div className="space-y-3">
                  {attachError && <div className="alert alert-error text-sm">{attachError}</div>}
                  {availableBundles.length === 0 ? (
                    <div className="py-8 text-center">
                      <Boxes className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">No active bundles found</p>
                      <button onClick={() => navigate('/assets/bundles/new')} className="btn-primary mt-3 text-sm">
                        Create Bundle
                      </button>
                    </div>
                  ) : (
                    <div className="divide-y divide-border border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      {availableBundles.map((b) => (
                        <button
                          key={b.id}
                          onClick={() => attachBundle(b.id)}
                          disabled={!!attachingBundleId}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center flex-shrink-0">
                            {attachingBundleId === b.id
                              ? <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                              : <QrCode className="w-4 h-4 text-indigo-600" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-mono font-medium text-foreground">{b.bundle_code}</p>
                            <p className="text-xs text-muted-foreground">{b.name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Modal>
            </div>
          )}

          {/* Activity tab */}
          {activeTab === 'activity' && (
            <div>
              {(!order.activity_logs || order.activity_logs.length === 0) ? (
                <div className="empty-state">
                  <div className="empty-state-icon">
                    <Clock className="w-7 h-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No activity recorded yet</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {order.activity_logs.map((log, i) => (
                    <div key={log.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-border mt-2 flex-shrink-0" />
                        {i < order.activity_logs.length - 1 && (
                          <div className="w-px flex-1 bg-border" />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <p className="text-sm text-foreground">{log.description}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.actor_name && `${log.actor_name} · `}
                          {formatDate(log.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
