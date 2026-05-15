import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Package, DollarSign, TrendingDown,
  AlertTriangle, Loader2, Pencil, ShoppingCart, BarChart3, Info
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { formatCurrency, formatDate, INVENTORY_CATEGORIES } from '@/lib/constants'
import {
  TRACKING_TYPE_COLORS, getTrackingTypeClass,
  getReservationStatusClass, RESERVATION_STATUS_COLORS,
} from '@/lib/statusColors'
import { calcDepreciation } from '@/lib/depreciation'
import { canEdit } from '@/lib/roles'
import type { InventoryCatalogItem } from '@/types/database'

interface RelatedOrderItem {
  id: string
  quantity: number
  reservation_status: string
  rental_days: number
  line_total: number
  created_at: string
  rental_orders: {
    id: string
    order_number: string
    event_name: string | null
    event_date: string | null
    status: string
  } | null
}

// ─── Quantity tile ────────────────────────────────────────────────────────────
function QtyTile({
  label, value, color = 'text-foreground',
}: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  )
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">{title}</h3>
    </div>
  )
}

// ─── Field row ────────────────────────────────────────────────────────────────
function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function InventoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, appRole } = useAuth()

  const [item, setItem] = useState<InventoryCatalogItem | null>(null)
  const [relatedOrders, setRelatedOrders] = useState<RelatedOrderItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'valuation' | 'activity'>('overview')

  const fetchData = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    setError(null)
    try {
      const [itemRes, ordersRes] = await Promise.all([
        supabase
          .from('inventory_catalog')
          .select('*')
          .eq('id', id)
          .eq('company_id', profile.company_id)
          .single(),
        supabase
          .from('order_items')
          .select(`
            id, quantity, reservation_status, rental_days, line_total, created_at,
            rental_orders(id, order_number, event_name, event_date, status)
          `)
          .eq('catalog_item_id', id)
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(25),
      ])

      if (itemRes.error) throw itemRes.error
      if (!itemRes.data) throw new Error('Item not found')
      setItem(itemRes.data as InventoryCatalogItem)
      setRelatedOrders((ordersRes.data ?? []) as unknown as RelatedOrderItem[])
    } catch (e: unknown) {
      setError((e as { message?: string }).message ?? 'Failed to load item')
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !item) {
    return (
      <div className="empty-state">
        <AlertTriangle className="w-6 h-6 text-red-500 mb-2" />
        <p className="text-sm text-muted-foreground">{error ?? 'Item not found'}</p>
        <button onClick={() => navigate('/inventory')} className="btn-secondary mt-4">
          Back to Inventory
        </button>
      </div>
    )
  }

  const depResult = calcDepreciation(item)
  const catMeta = INVENTORY_CATEGORIES.find(c => c.value === item.category)
  const availPct = item.quantity_owned > 0
    ? Math.round((item.quantity_available / item.quantity_owned) * 100)
    : 0
  const isLowStock = item.reorder_point != null
    ? item.quantity_available <= item.reorder_point
    : item.quantity_available < 3 && item.quantity_owned > 0

  const tabs = [
    { key: 'overview',  label: 'Overview',   icon: Package },
    { key: 'valuation', label: 'Valuation',  icon: BarChart3 },
    { key: 'activity',  label: 'Activity',   icon: ShoppingCart },
  ] as const

  return (
    <PageShell>
      <PageHeader
        title={item.name}
        subtitle={item.sku ? `SKU: ${item.sku}` : catMeta?.label ?? item.category}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/inventory')} className="btn-secondary">
              <ArrowLeft className="w-4 h-4" /> Inventory
            </button>
            {canEdit(appRole) && (
              <button
                onClick={() => navigate(`/inventory/${item.id}/edit`)}
                className="btn-primary"
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
          </div>
        }
      />

      {/* Identity strip */}
      <div className="flex flex-wrap items-center gap-2 -mt-2 mb-2">
        <span className={`badge text-xs ${getTrackingTypeClass(item.tracking_type)}`}>
          {TRACKING_TYPE_COLORS[item.tracking_type]?.label ?? item.tracking_type}
        </span>
        <span className="badge bg-muted text-muted-foreground text-xs">
          {catMeta?.icon} {catMeta?.label ?? item.category}
        </span>
        {isLowStock && (
          <span className="badge bg-amber-100 text-amber-700 text-xs">
            <AlertTriangle className="w-3 h-3 inline mr-1" />Low Stock
          </span>
        )}
        {item.quantity_available === 0 && item.quantity_owned > 0 && (
          <span className="badge bg-red-100 text-red-700 text-xs">Out of Stock</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border mb-6">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Operational Summary */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionHeader icon={Package} title="Operational Summary" />
            <div className="grid grid-cols-3 gap-3 mb-4">
              <QtyTile label="Owned" value={item.quantity_owned} />
              <QtyTile
                label="Available"
                value={item.quantity_available}
                color={item.quantity_available === 0 ? 'text-red-600' : availPct < 25 ? 'text-amber-600' : 'text-emerald-600'}
              />
              <QtyTile
                label="Reserved"
                value={item.quantity_reserved}
                color={item.quantity_reserved > 0 ? 'text-blue-600' : 'text-foreground'}
              />
              <QtyTile
                label="Out"
                value={item.quantity_out}
                color={item.quantity_out > 0 ? 'text-violet-600' : 'text-foreground'}
              />
              <QtyTile
                label="Damaged"
                value={item.quantity_damaged}
                color={item.quantity_damaged > 0 ? 'text-red-600' : 'text-foreground'}
              />
              <QtyTile
                label="In Repair"
                value={item.quantity_under_repair}
                color={item.quantity_under_repair > 0 ? 'text-amber-600' : 'text-foreground'}
              />
            </div>
            {item.reorder_point != null && (
              <p className="text-xs text-muted-foreground">
                Reorder point: {item.reorder_point} units
                {item.quantity_available <= item.reorder_point && (
                  <span className="ml-1 text-amber-600 font-medium">— reorder now</span>
                )}
              </p>
            )}
          </div>

          {/* Operational Details */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionHeader icon={Info} title="Operational Details" />
            <FieldRow label="Rate / Day" value={formatCurrency(item.rental_rate)} />
            <FieldRow label="Replacement Cost" value={item.replacement_cost ? formatCurrency(item.replacement_cost) : '—'} />
            <FieldRow
              label="Default Damage Fee"
              value={item.damage_fee_default != null ? formatCurrency(item.damage_fee_default) : '—'}
            />
            <FieldRow
              label="Default Replace Fee"
              value={item.replacement_fee_default != null ? formatCurrency(item.replacement_fee_default) : '—'}
            />
            <FieldRow label="Vendor" value={item.vendor_name ?? '—'} />
            <FieldRow label="Storage Location" value={item.warehouse_location ?? '—'} />
            {item.condition_notes && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Condition Notes</p>
                <p className="text-sm text-foreground">{item.condition_notes}</p>
              </div>
            )}
            {item.notes && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm text-foreground">{item.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VALUATION TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'valuation' && (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Cost basis */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionHeader icon={DollarSign} title="Cost Basis" />
            <FieldRow label="Purchase Cost" value={item.purchase_cost != null ? formatCurrency(item.purchase_cost) : '—'} />
            <FieldRow label="Replacement Cost" value={item.replacement_cost ? formatCurrency(item.replacement_cost) : '—'} />
            <FieldRow label="Purchase Date" value={item.purchase_date ? formatDate(item.purchase_date) : '—'} />
            <FieldRow label="Vendor" value={item.vendor_name ?? '—'} />

            {item.purchase_cost != null && item.replacement_cost > 0 && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
                <p className="text-muted-foreground mb-1">Replacement premium</p>
                <p className={`font-semibold ${item.replacement_cost > item.purchase_cost ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {item.replacement_cost > item.purchase_cost ? '+' : ''}
                  {formatCurrency(item.replacement_cost - item.purchase_cost)}
                  {' '}({item.purchase_cost > 0 ? ((item.replacement_cost - item.purchase_cost) / item.purchase_cost * 100).toFixed(0) : 0}%)
                </p>
              </div>
            )}
          </div>

          {/* Depreciation */}
          <div className="bg-card border border-border rounded-xl p-5">
            <SectionHeader icon={TrendingDown} title="Depreciation" />

            {item.depreciation_method === 'none' || item.depreciation_method == null ? (
              <div className="text-center py-8">
                <TrendingDown className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {item.depreciation_method === 'none'
                    ? 'Depreciation disabled for this item'
                    : 'Depreciation not configured'}
                </p>
                {canEdit(appRole) && (
                  <button
                    onClick={() => navigate(`/inventory/${item.id}/edit`)}
                    className="btn-secondary text-xs mt-3"
                  >
                    Configure in Edit
                  </button>
                )}
              </div>
            ) : depResult == null ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Missing required fields: purchase cost, purchase date, or useful life.
                </p>
                {canEdit(appRole) && (
                  <button
                    onClick={() => navigate(`/inventory/${item.id}/edit`)}
                    className="btn-secondary text-xs mt-3"
                  >
                    Complete Setup
                  </button>
                )}
              </div>
            ) : (
              <>
                <FieldRow label="Method" value="Straight-line" />
                <FieldRow
                  label="Useful Life"
                  value={`${item.expected_lifespan_months} months (${(item.expected_lifespan_months! / 12).toFixed(1)} yrs)`}
                />
                <FieldRow
                  label="Monthly Depreciation"
                  value={formatCurrency(depResult.monthlyDepreciation)}
                />
                <FieldRow
                  label="Residual Value"
                  value={formatCurrency(item.residual_value ?? 0)}
                />
                <FieldRow
                  label="Months Elapsed"
                  value={`${depResult.monthsElapsed} of ${item.expected_lifespan_months}`}
                />
                <FieldRow
                  label="Accumulated Depreciation"
                  value={
                    <span className="text-amber-600">{formatCurrency(depResult.accumulated)}</span>
                  }
                />
                <FieldRow
                  label="Est. Book Value"
                  value={
                    <span className="font-semibold text-emerald-700">
                      {formatCurrency(depResult.bookValue)}
                    </span>
                  }
                />

                {/* Depreciation progress bar */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Depreciated</span>
                    <span>{depResult.percentDepreciated.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        depResult.percentDepreciated > 75 ? 'bg-red-500' :
                        depResult.percentDepreciated > 50 ? 'bg-amber-400' :
                        'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, depResult.percentDepreciated)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 text-center">
                    Operational estimate only — not tax/accounting-grade
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── ACTIVITY TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <SectionHeader
            icon={ShoppingCart}
            title={`Order History (${relatedOrders.length})`}
          />

          {relatedOrders.length === 0 ? (
            <div className="empty-state py-12">
              <ShoppingCart className="w-7 h-7 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No orders found for this item.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Order</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Event</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Event Date</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Qty</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Days</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Revenue</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {relatedOrders.map((oi) => (
                    <tr
                      key={oi.id}
                      className="hover:bg-muted/30 cursor-pointer transition-colors"
                      onClick={() => oi.rental_orders && navigate(`/orders/${oi.rental_orders.id}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {oi.rental_orders?.order_number ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[180px] truncate">
                        {oi.rental_orders?.event_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {oi.rental_orders?.event_date ? formatDate(oi.rental_orders.event_date) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">{oi.quantity}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{oi.rental_days}</td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-700">
                        {formatCurrency(oi.line_total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`badge text-xs ${getReservationStatusClass(oi.reservation_status)}`}>
                          {RESERVATION_STATUS_COLORS[oi.reservation_status]?.label ?? oi.reservation_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {relatedOrders.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-border bg-muted/20">
                      <td colSpan={5} className="px-4 py-2 text-xs text-muted-foreground">
                        {relatedOrders.length} order item{relatedOrders.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-4 py-2 text-right text-sm font-semibold text-emerald-700">
                        {formatCurrency(relatedOrders.reduce((s, r) => s + r.line_total, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}
    </PageShell>
  )
}
