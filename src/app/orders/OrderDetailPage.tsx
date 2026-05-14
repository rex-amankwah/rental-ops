import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, MapPin, Calendar, Package, FileText,
  CreditCard, Clock, User, Phone, Mail, AlertTriangle, Truck,
  Loader2, CheckCircle2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAvailability } from '@/hooks/useAvailability'
import { StatusBadge, PriorityBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate, ORDER_STATUS_CONFIG } from '@/lib/constants'
import type { RentalOrder, Customer, OrderItem, Invoice, Payment, ActivityLog } from '@/types/database'

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
  const { profile } = useAuth()
  const { reserveItems, releaseReservations } = useAvailability()
  const [order, setOrder] = useState<FullOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState<'details' | 'items' | 'invoices' | 'payments' | 'activity'>('details')
  const [reserving, setReserving] = useState(false)
  const [invoicing, setInvoicing] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchOrder = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    setNotFound(false)
    setFetchError(null)
    try {
      const { data, error } = await supabase
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
        .single()

      if (error) {
        if (error.code === 'PGRST116' || error.message?.includes('0 rows')) {
          setNotFound(true)
        } else {
          console.error('[OrderDetailPage] fetch error:', error)
          setFetchError(`${error.message} (${error.code})`)
        }
        return
      }
      setOrder(data as unknown as FullOrder)
    } catch (err) {
      console.error('[OrderDetailPage] unexpected error:', err)
      setFetchError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { fetchOrder() }, [fetchOrder])

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
          {/* Reserve inventory */}
          {order.order_items?.length > 0 && ['confirmed','awaiting_deposit','quote_sent','inquiry'].includes(order.status) && (
            <button onClick={() => handleReserve(false)} disabled={reserving} className="btn-primary">
              {reserving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Reserve Inventory
            </button>
          )}
          {/* Release reservation */}
          {order.status === 'inventory_reserved' && (
            <button onClick={handleRelease} disabled={reserving} className="btn-secondary">
              {reserving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Release Reservation
            </button>
          )}
          {/* Generate invoice */}
          {order.order_items?.length > 0 && !['cancelled','refunded','closed'].includes(order.status) && (
            <button onClick={handleGenerateInvoice} disabled={invoicing} className="btn-secondary">
              {invoicing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
              Generate Invoice
            </button>
          )}
          {/* Send to dispatch */}
          {!['cancelled','refunded','closed','completed','returned'].includes(order.status) && (
            <button onClick={() => navigate(`/dispatch/new?orderId=${order.id}`)} className="btn-secondary">
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
                            <span className={`badge text-xs ${
                              item.reservation_status === 'reserved' ? 'bg-blue-100 text-blue-700' :
                              item.reservation_status === 'out' ? 'bg-violet-100 text-violet-700' :
                              item.reservation_status === 'returned' ? 'bg-emerald-100 text-emerald-700' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {item.reservation_status}
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
                            <span className={`badge text-xs ${
                              pmt.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              pmt.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {pmt.status}
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
