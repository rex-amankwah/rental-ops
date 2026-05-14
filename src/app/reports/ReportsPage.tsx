import { useEffect, useState, useCallback } from 'react'
import { TrendingUp, DollarSign, Package, Users, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, StatCard } from '@/components/common/PageShell'
import { formatCurrency } from '@/lib/constants'

interface TopItem {
  item_name_snapshot: string
  total_qty: number
  total_revenue: number
}

interface ReportData {
  revenueThisMonth: number
  revenueLastMonth: number
  outstandingBalance: number
  overdueBalance: number
  activeOrders: number
  totalCustomers: number
  inventoryUtilization: number
  topItems: TopItem[]
}

export default function ReportsPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    setFetchError(null)
    try {
      const now = new Date()
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
      const cid = profile.company_id

      const [
        revenueNow, revenuePrev, outstanding, overdue,
        activeOrders, customers, inventory, topItemsRes,
      ] = await Promise.all([
        // Revenue this month (completed payments)
        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('status', 'completed')
          .not('payment_type', 'eq', 'refund')
          .gte('payment_date', thisMonthStart),
        // Revenue last month
        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('status', 'completed')
          .not('payment_type', 'eq', 'refund')
          .gte('payment_date', lastMonthStart).lte('payment_date', lastMonthEnd),
        // Outstanding invoices (sent + partial)
        supabase.from('invoices').select('balance_due')
          .eq('company_id', cid).in('status', ['sent', 'partial']),
        // Overdue invoices
        supabase.from('invoices').select('balance_due')
          .eq('company_id', cid).eq('status', 'overdue'),
        // Active orders
        supabase.from('rental_orders').select('id', { count: 'exact' })
          .eq('company_id', cid)
          .not('status', 'in', '("cancelled","refunded","closed","completed")'),
        // Total active customers
        supabase.from('customers').select('id', { count: 'exact' })
          .eq('company_id', cid).eq('is_active', true),
        // Inventory utilization (items out vs owned)
        supabase.from('inventory_catalog').select('quantity_owned,quantity_out')
          .eq('company_id', cid).eq('is_active', true),
        // Top 10 rented items by quantity
        supabase.from('order_items').select('item_name_snapshot,quantity,line_total')
          .eq('company_id', cid),
      ])

      const sum = (arr: { amount?: number; balance_due?: number }[] | null, key: 'amount' | 'balance_due') =>
        (arr ?? []).reduce((a, r) => a + (r[key] ?? 0), 0)

      // Aggregate top items
      const itemMap: Record<string, TopItem> = {}
      for (const row of topItemsRes.data ?? []) {
        const name = row.item_name_snapshot as string
        if (!itemMap[name]) itemMap[name] = { item_name_snapshot: name, total_qty: 0, total_revenue: 0 }
        itemMap[name].total_qty += (row.quantity as number) ?? 0
        itemMap[name].total_revenue += (row.line_total as number) ?? 0
      }
      const topItems = Object.values(itemMap)
        .sort((a, b) => b.total_qty - a.total_qty)
        .slice(0, 10)

      // Inventory utilization %
      const invRows = inventory.data ?? []
      const totalOwned = invRows.reduce((a, r) => a + (r.quantity_owned as number ?? 0), 0)
      const totalOut   = invRows.reduce((a, r) => a + (r.quantity_out as number ?? 0), 0)
      const utilization = totalOwned > 0 ? Math.round((totalOut / totalOwned) * 100) : 0

      setData({
        revenueThisMonth: sum(revenueNow.data, 'amount'),
        revenueLastMonth: sum(revenuePrev.data, 'amount'),
        outstandingBalance: sum(outstanding.data, 'balance_due'),
        overdueBalance: sum(overdue.data, 'balance_due'),
        activeOrders: activeOrders.count ?? 0,
        totalCustomers: customers.count ?? 0,
        inventoryUtilization: utilization,
        topItems,
      })
    } catch (err: unknown) {
      setFetchError((err as { message?: string }).message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id])

  useEffect(() => { load() }, [load])

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        subtitle="Read-only summary — live data"
      />

      {fetchError && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Revenue This Month"
              value={formatCurrency(data.revenueThisMonth)}
              sub={`Last month: ${formatCurrency(data.revenueLastMonth)}`}
              icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
              iconBg="bg-emerald-50"
              colorClass="text-emerald-700"
            />
            <StatCard
              label="Outstanding Balance"
              value={formatCurrency(data.outstandingBalance)}
              sub={data.overdueBalance > 0 ? `${formatCurrency(data.overdueBalance)} overdue` : 'None overdue'}
              icon={<DollarSign className="w-5 h-5 text-amber-600" />}
              iconBg="bg-amber-50"
              colorClass={data.overdueBalance > 0 ? 'text-red-700' : 'text-amber-700'}
            />
            <StatCard
              label="Active Orders"
              value={data.activeOrders}
              icon={<Package className="w-5 h-5 text-blue-600" />}
              iconBg="bg-blue-50"
              colorClass="text-blue-700"
            />
            <StatCard
              label="Inventory Utilization"
              value={`${data.inventoryUtilization}%`}
              sub={`${data.totalCustomers} active customers`}
              icon={<Users className="w-5 h-5 text-violet-600" />}
              iconBg="bg-violet-50"
              colorClass="text-violet-700"
            />
          </div>

          {/* Top items table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Top Rented Items (all time)</h3>
            </div>
            {data.topItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No order items yet.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-right">Total Qty Rented</th>
                    <th className="text-right">Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((item, i) => (
                    <tr key={item.item_name_snapshot}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                          <span className="text-sm font-medium text-foreground">{item.item_name_snapshot}</span>
                        </div>
                      </td>
                      <td className="text-right text-sm text-foreground">{item.total_qty.toLocaleString()}</td>
                      <td className="text-right text-sm font-medium text-emerald-700">{formatCurrency(item.total_revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Advanced reports (date range, exports, charts) — planned for Phase 3.
          </p>
        </div>
      )}
    </PageShell>
  )
}
