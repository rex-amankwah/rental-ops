import { useEffect, useState, useCallback, ReactNode } from 'react'
import {
  TrendingUp, Users, AlertTriangle, Loader2,
  Receipt, Truck, ShieldAlert, Package, BarChart3
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { formatCurrency, formatDate } from '@/lib/constants'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MonthRevenue { month: string; label: string; amount: number }
interface TopItem { name: string; totalQty: number; totalRevenue: number }
interface TopCustomer { name: string; totalPaid: number }
interface DispatchRow {
  id: string; orderNumber: string; customerName: string
  date: string; time: string | null; city: string | null
}

interface ReportData {
  revenueThisMonth: number
  revenueLastMonth: number
  totalCollected: number
  revenueByMonth: MonthRevenue[]
  outstandingBalance: number
  overdueBalance: number
  totalExpenses: number
  profitEstimate: number
  taxCollected: number
  taxableSales: number
  topCustomers: TopCustomer[]
  topItems: TopItem[]
  inventoryUtilization: number
  totalOwned: number
  totalOut: number
  damageCost: number
  openDamages: number
  orderVolume: number
  avgOrderValue: number
  returnIssues: number
  upcomingDeliveries: DispatchRow[]
  upcomingPickups: DispatchRow[]
  pendingDispatches: number
  overdueOrders: number
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: {
  icon: ReactNode; title: string; subtitle?: string; children: ReactNode
}) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  )
}

function StatGrid({ cols = 4, children }: { cols?: 2 | 4; children: ReactNode }) {
  return (
    <div className={`grid gap-3 ${cols === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {children}
    </div>
  )
}

function Stat({ label, value, sub, warn }: {
  label: string; value: string | number; sub?: string; warn?: boolean
}) {
  return (
    <div className="bg-muted/40 rounded-lg px-4 py-3 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-base font-semibold ${warn ? 'text-red-600' : 'text-foreground'}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function PlannedItem({ title, description }: { title: string; description?: string }) {
  return (
    <div className="bg-muted/20 border border-dashed border-border rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground/70 mt-0.5 leading-relaxed">{description}</p>
          )}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50 bg-muted px-2 py-0.5 rounded-full flex-shrink-0 whitespace-nowrap">
          Phase 3
        </span>
      </div>
    </div>
  )
}

function MomBadge({ thisMonth, lastMonth }: { thisMonth: number; lastMonth: number }) {
  if (lastMonth === 0) return null
  const pct = ((thisMonth - lastMonth) / lastMonth) * 100
  const up = pct >= 0
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '+' : ''}{pct.toFixed(1)}% vs last month
    </span>
  )
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
      {children}
    </p>
  )
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground text-center py-6 bg-muted/30 rounded-lg">
      {message}
    </p>
  )
}

function fmtTime(t: string | null | undefined) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hr = parseInt(h, 10)
  return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { profile } = useAuth()
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true); setFetchError(null)
    try {
      const now = new Date()
      const today          = now.toISOString().split('T')[0]
      const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0]
      const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0]
      const sixMonthsAgo   = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().split('T')[0]
      const twoWeeksOut    = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14).toISOString().split('T')[0]
      const cid = profile.company_id

      const [
        pmtNow, pmtPrev, pmt6mo, pmtAll,
        invoiceOutstanding, invoiceOverdue,
        invoiceTax, invoiceTaxable,
        expensesRes,
        itemsRes, inventoryRes,
        custPmtRes,
        ordersRes, returnIssuesRes,
        damagesRes,
        deliveriesRes, pickupsRes,
        pendingRes, overdueOrdersRes,
      ] = await Promise.all([
        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('status', 'completed').not('payment_type', 'eq', 'refund')
          .gte('payment_date', thisMonthStart),

        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('status', 'completed').not('payment_type', 'eq', 'refund')
          .gte('payment_date', lastMonthStart).lte('payment_date', lastMonthEnd),

        supabase.from('payments').select('amount,payment_date')
          .eq('company_id', cid).eq('status', 'completed').not('payment_type', 'eq', 'refund')
          .gte('payment_date', sixMonthsAgo),

        supabase.from('payments').select('amount')
          .eq('company_id', cid).eq('status', 'completed').not('payment_type', 'eq', 'refund'),

        supabase.from('invoices').select('balance_due')
          .eq('company_id', cid).in('status', ['sent', 'partial']),

        supabase.from('invoices').select('balance_due')
          .eq('company_id', cid).eq('status', 'overdue'),

        supabase.from('invoices').select('tax_amount')
          .eq('company_id', cid).eq('status', 'paid').gt('tax_amount', 0),

        supabase.from('invoices').select('subtotal')
          .eq('company_id', cid).gt('tax_amount', 0).not('status', 'eq', 'voided'),

        supabase.from('expenses').select('amount').eq('company_id', cid),

        supabase.from('order_items').select('item_name_snapshot,quantity,line_total')
          .eq('company_id', cid),

        supabase.from('inventory_catalog').select('quantity_owned,quantity_out')
          .eq('company_id', cid).eq('is_active', true),

        supabase.from('payments')
          .select('customer_id,amount,customer:customers(first_name,last_name)')
          .eq('company_id', cid).eq('status', 'completed').not('payment_type', 'eq', 'refund')
          .limit(500),

        supabase.from('rental_orders').select('id,total_amount', { count: 'exact' })
          .eq('company_id', cid).not('status', 'in', '("cancelled","refunded")'),

        supabase.from('rental_orders').select('id', { count: 'exact' })
          .eq('company_id', cid).in('status', ['overdue', 'partially_returned', 'damaged']),

        supabase.from('damage_reports').select('estimated_cost,status')
          .eq('company_id', cid),

        supabase.from('dispatches')
          .select('id,scheduled_delivery_date,scheduled_delivery_time,delivery_city,order:rental_orders(order_number,customer:customers(first_name,last_name))')
          .eq('company_id', cid)
          .not('status', 'in', '("cancelled","returned")')
          .in('dispatch_type', ['delivery', 'both'])
          .gte('scheduled_delivery_date', today)
          .lte('scheduled_delivery_date', twoWeeksOut)
          .order('scheduled_delivery_date').limit(10),

        supabase.from('dispatches')
          .select('id,scheduled_pickup_date,scheduled_pickup_time,delivery_city,order:rental_orders(order_number,customer:customers(first_name,last_name))')
          .eq('company_id', cid)
          .not('status', 'in', '("cancelled","returned")')
          .in('dispatch_type', ['pickup', 'both'])
          .gte('scheduled_pickup_date', today)
          .lte('scheduled_pickup_date', twoWeeksOut)
          .order('scheduled_pickup_date').limit(10),

        supabase.from('dispatches').select('id', { count: 'exact' })
          .eq('company_id', cid).eq('status', 'scheduled'),

        supabase.from('rental_orders').select('id', { count: 'exact' })
          .eq('company_id', cid).eq('status', 'overdue'),
      ])

      const sumAmt = (rows: { amount?: number }[] | null) =>
        (rows ?? []).reduce((a, r) => a + (r.amount ?? 0), 0)

      // Revenue by month (last 6)
      const months: MonthRevenue[] = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
        return {
          month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
          label: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
          amount: 0,
        }
      })
      for (const p of pmt6mo.data ?? []) {
        const key = (p.payment_date as string).substring(0, 7)
        const m = months.find(x => x.month === key)
        if (m) m.amount += (p.amount as number) ?? 0
      }

      // Top items
      const itemMap: Record<string, TopItem> = {}
      for (const r of itemsRes.data ?? []) {
        const n = r.item_name_snapshot as string
        if (!itemMap[n]) itemMap[n] = { name: n, totalQty: 0, totalRevenue: 0 }
        itemMap[n].totalQty    += (r.quantity as number)  ?? 0
        itemMap[n].totalRevenue += (r.line_total as number) ?? 0
      }
      const topItems = Object.values(itemMap).sort((a, b) => b.totalQty - a.totalQty).slice(0, 10)

      // Inventory utilization
      const invRows  = inventoryRes.data ?? []
      const totalOwned = invRows.reduce((a, r) => a + ((r.quantity_owned as number) ?? 0), 0)
      const totalOut   = invRows.reduce((a, r) => a + ((r.quantity_out  as number) ?? 0), 0)
      const inventoryUtilization = totalOwned > 0 ? Math.round((totalOut / totalOwned) * 100) : 0

      // Top customers
      type CustPmtRow = { customer_id: string; amount: number; customer: { first_name: string; last_name: string } | null }
      const custMap: Record<string, TopCustomer> = {}
      for (const p of (custPmtRes.data ?? []) as unknown as CustPmtRow[]) {
        if (!p.customer_id || !p.customer) continue
        if (!custMap[p.customer_id]) custMap[p.customer_id] = {
          name: `${p.customer.first_name} ${p.customer.last_name}`, totalPaid: 0
        }
        custMap[p.customer_id].totalPaid += p.amount ?? 0
      }
      const topCustomers = Object.values(custMap).sort((a, b) => b.totalPaid - a.totalPaid).slice(0, 5)

      // Order stats
      const orderRows  = ordersRes.data ?? []
      const orderVolume = ordersRes.count ?? 0
      const avgOrderValue = orderRows.length > 0
        ? orderRows.reduce((a, r) => a + ((r.total_amount as number) ?? 0), 0) / orderRows.length
        : 0

      // Damage
      const dmgRows    = damagesRes.data ?? []
      const damageCost = dmgRows.reduce((a, r) => a + ((r.estimated_cost as number) ?? 0), 0)
      const openDamages = dmgRows.filter(r => !['resolved', 'closed'].includes(r.status as string)).length

      // Dispatch row helper
      type OrdJoin = { order_number: string; customer: { first_name: string; last_name: string } | null } | null
      const toRow = (d: Record<string, unknown>, dateKey: string, timeKey: string): DispatchRow => {
        const ord = d.order as OrdJoin
        const c   = ord?.customer
        return {
          id:           d.id as string,
          orderNumber:  ord?.order_number ?? '—',
          customerName: c ? `${c.first_name} ${c.last_name}` : '—',
          date:         d[dateKey] as string,
          time:         d[timeKey] as string | null,
          city:         d.delivery_city as string | null,
        }
      }

      const totalCollected = sumAmt(pmtAll.data)
      const totalExpenses  = (expensesRes.data ?? []).reduce((a, r) => a + ((r.amount as number) ?? 0), 0)

      setData({
        revenueThisMonth:   sumAmt(pmtNow.data),
        revenueLastMonth:   sumAmt(pmtPrev.data),
        totalCollected,
        revenueByMonth:     months,
        outstandingBalance: (invoiceOutstanding.data ?? []).reduce((a, r) => a + ((r.balance_due as number) ?? 0), 0),
        overdueBalance:     (invoiceOverdue.data  ?? []).reduce((a, r) => a + ((r.balance_due as number) ?? 0), 0),
        totalExpenses,
        profitEstimate:     totalCollected - totalExpenses,
        taxCollected:       (invoiceTax.data      ?? []).reduce((a, r) => a + ((r.tax_amount as number) ?? 0), 0),
        taxableSales:       (invoiceTaxable.data  ?? []).reduce((a, r) => a + ((r.subtotal   as number) ?? 0), 0),
        topCustomers, topItems,
        inventoryUtilization, totalOwned, totalOut,
        damageCost, openDamages,
        orderVolume, avgOrderValue,
        returnIssues:        returnIssuesRes.count ?? 0,
        upcomingDeliveries: (deliveriesRes.data ?? []).map(d => toRow(d as Record<string, unknown>, 'scheduled_delivery_date', 'scheduled_delivery_time')),
        upcomingPickups:    (pickupsRes.data   ?? []).map(d => toRow(d as Record<string, unknown>, 'scheduled_pickup_date',   'scheduled_pickup_time')),
        pendingDispatches:   pendingRes.count ?? 0,
        overdueOrders:       overdueOrdersRes.count ?? 0,
      })
    } catch (err: unknown) {
      setFetchError((err as { message?: string }).message ?? String(err))
    } finally { setLoading(false) }
  }, [profile?.company_id])

  useEffect(() => { load() }, [load])

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <PageHeader title="Reports" subtitle="Live data — planned exports noted where applicable" />

      {fetchError && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{fetchError}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : data && (
        <div className="space-y-6">

          {/* ── 1. Accounting ─────────────────────────────────────────────── */}
          <Section
            icon={<TrendingUp className="w-4 h-4" />}
            title="Accounting Report"
            subtitle="Revenue, collections, expenses, and profit estimate"
          >
            <StatGrid>
              <div className="bg-muted/40 rounded-lg px-4 py-3 space-y-1">
                <p className="text-xs text-muted-foreground">Revenue This Month</p>
                <p className="text-base font-semibold text-foreground">{formatCurrency(data.revenueThisMonth)}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground">Last month: {formatCurrency(data.revenueLastMonth)}</span>
                  <MomBadge thisMonth={data.revenueThisMonth} lastMonth={data.revenueLastMonth} />
                </div>
              </div>
              <Stat label="Total Collected (All Time)" value={formatCurrency(data.totalCollected)} />
              <Stat
                label="Outstanding Receivables"
                value={formatCurrency(data.outstandingBalance)}
                warn={data.outstandingBalance > 0}
                sub={data.overdueBalance > 0 ? `${formatCurrency(data.overdueBalance)} overdue` : undefined}
              />
              <Stat label="Total Expenses Recorded" value={formatCurrency(data.totalExpenses)} />
            </StatGrid>

            {/* Profit estimate */}
            <div className={`rounded-lg px-4 py-3 border ${data.profitEstimate >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className="text-xs text-muted-foreground mb-0.5">Profit Estimate (Collected − Expenses)</p>
              <p className={`text-xl font-bold ${data.profitEstimate >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {formatCurrency(data.profitEstimate)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Based on completed payments vs. recorded expenses only. Does not account for unpaid invoices or accruals.
              </p>
            </div>

            {/* Revenue by month */}
            <div>
              <SectionLabel>Payments Collected by Month — Last 6 Months</SectionLabel>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Collected</th>
                  </tr>
                </thead>
                <tbody>
                  {data.revenueByMonth.map(m => (
                    <tr key={m.month}>
                      <td className="text-sm text-foreground">{m.label}</td>
                      <td className={`text-right text-sm font-medium ${m.amount > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                        {m.amount > 0 ? formatCurrency(m.amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <SectionLabel>Coming in Phase 3</SectionLabel>
              <div className="space-y-2">
                <PlannedItem title="Export All Payments to CSV" description="Download a full payment history with dates, amounts, types, and references." />
                <PlannedItem title="Export Expense Summary to CSV" description="Export all recorded expenses grouped by category and date range." />
                <PlannedItem title="Generate PDF Financial Report" description="Printable revenue and expense summary for a selected month or quarter." />
              </div>
            </div>
          </Section>

          {/* ── 2. Tax ────────────────────────────────────────────────────── */}
          <Section
            icon={<Receipt className="w-4 h-4" />}
            title="Tax Report"
            subtitle="Tax collected on paid invoices"
          >
            <StatGrid cols={2}>
              <Stat
                label="Tax Collected (Paid Invoices)"
                value={formatCurrency(data.taxCollected)}
                sub="From invoices with status = paid"
              />
              <Stat
                label="Taxable Sales (Gross)"
                value={formatCurrency(data.taxableSales)}
                sub="Invoices with any tax amount"
              />
            </StatGrid>

            <div>
              <SectionLabel>Coming in Phase 3</SectionLabel>
              <div className="space-y-2">
                <PlannedItem title="Exempt / Non-Taxable Sales Breakdown" description="Itemized list of orders and invoices where no tax was applied." />
                <PlannedItem title="Quarterly Tax Summary" description="Three-month tax collected vs. taxable sales summary for filing prep." />
                <PlannedItem title="Year-End Tax Report" description="Annual tax collected totals, organized by quarter and category." />
                <PlannedItem title="Export Tax Data to CSV" description="Raw tax data export with invoice numbers and amounts for accountants." />
              </div>
            </div>
          </Section>

          {/* ── 3. Management ─────────────────────────────────────────────── */}
          <Section
            icon={<Users className="w-4 h-4" />}
            title="Management Report"
            subtitle="Order performance, top customers, inventory, and damage"
          >
            <StatGrid>
              <Stat label="Total Orders" value={data.orderVolume} sub="Excl. cancelled / refunded" />
              <Stat label="Avg Order Value" value={formatCurrency(data.avgOrderValue)} />
              <Stat
                label="Inventory Utilization"
                value={`${data.inventoryUtilization}%`}
                sub={`${data.totalOut} of ${data.totalOwned} units out`}
              />
              <Stat
                label="Return Issues"
                value={data.returnIssues}
                warn={data.returnIssues > 0}
                sub="Overdue / damaged / partial"
              />
            </StatGrid>

            {/* Damage */}
            <div>
              <SectionLabel>Damage Summary</SectionLabel>
              <StatGrid cols={2}>
                <Stat
                  label="Estimated Damage Cost (All Time)"
                  value={formatCurrency(data.damageCost)}
                  warn={data.damageCost > 0}
                />
                <Stat
                  label="Open Damage Reports"
                  value={data.openDamages}
                  warn={data.openDamages > 0}
                  sub="Unresolved / not closed"
                />
              </StatGrid>
            </div>

            {/* Top customers */}
            <div>
              <SectionLabel>Top Customers by Total Paid</SectionLabel>
              {data.topCustomers.length === 0 ? (
                <EmptyRow message="No payment data yet." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Customer</th>
                      <th className="text-right">Total Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topCustomers.map((c, i) => (
                      <tr key={c.name}>
                        <td className="text-xs text-muted-foreground w-8">{i + 1}.</td>
                        <td className="text-sm font-medium text-foreground">{c.name}</td>
                        <td className="text-right text-sm font-medium text-emerald-700">{formatCurrency(c.totalPaid)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top items */}
            <div>
              <SectionLabel>Top Rented Items (All Time)</SectionLabel>
              {data.topItems.length === 0 ? (
                <EmptyRow message="No order items yet." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item</th>
                      <th className="text-right">Qty Rented</th>
                      <th className="text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topItems.map((item, i) => (
                      <tr key={item.name}>
                        <td className="text-xs text-muted-foreground w-8">{i + 1}.</td>
                        <td className="text-sm font-medium text-foreground">{item.name}</td>
                        <td className="text-right text-sm text-foreground">{item.totalQty.toLocaleString()}</td>
                        <td className="text-right text-sm font-medium text-emerald-700">{formatCurrency(item.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Section>

          {/* ── 4. Operations ─────────────────────────────────────────────── */}
          <Section
            icon={<Truck className="w-4 h-4" />}
            title="Operations Report"
            subtitle="Upcoming deliveries, pickups, and open issues"
          >
            <StatGrid>
              <Stat label="Pending Dispatches" value={data.pendingDispatches} sub="Status: scheduled" />
              <Stat label="Overdue Orders" value={data.overdueOrders} warn={data.overdueOrders > 0} />
              <Stat label="Deliveries (Next 14 Days)" value={data.upcomingDeliveries.length} />
              <Stat label="Pickups Due (Next 14 Days)" value={data.upcomingPickups.length} />
            </StatGrid>

            {/* Upcoming deliveries */}
            <div>
              <SectionLabel>Upcoming Deliveries — Next 14 Days</SectionLabel>
              {data.upcomingDeliveries.length === 0 ? (
                <EmptyRow message="No upcoming deliveries in the next 14 days." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcomingDeliveries.map(d => (
                      <tr key={d.id}>
                        <td className="text-sm whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="text-sm text-muted-foreground">{fmtTime(d.time) ?? '—'}</td>
                        <td className="font-mono text-xs font-semibold text-primary">{d.orderNumber}</td>
                        <td className="text-sm text-foreground">{d.customerName}</td>
                        <td className="text-sm text-muted-foreground">{d.city ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Upcoming pickups */}
            <div>
              <SectionLabel>Pickups Due — Next 14 Days</SectionLabel>
              {data.upcomingPickups.length === 0 ? (
                <EmptyRow message="No pickups due in the next 14 days." />
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.upcomingPickups.map(d => (
                      <tr key={d.id}>
                        <td className="text-sm whitespace-nowrap">{formatDate(d.date)}</td>
                        <td className="text-sm text-muted-foreground">{fmtTime(d.time) ?? '—'}</td>
                        <td className="font-mono text-xs font-semibold text-primary">{d.orderNumber}</td>
                        <td className="text-sm text-foreground">{d.customerName}</td>
                        <td className="text-sm text-muted-foreground">{d.city ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Overdue returns notice */}
            {data.overdueOrders > 0 && (
              <div className="alert alert-warning">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <span>
                  <strong>{data.overdueOrders}</strong> order{data.overdueOrders !== 1 ? 's' : ''} marked <strong>overdue</strong>.
                  Check the Orders page to follow up.
                </span>
              </div>
            )}

            {/* Inventory utilization callout */}
            {data.inventoryUtilization > 80 && (
              <div className="alert alert-warning">
                <Package className="w-4 h-4 flex-shrink-0" />
                <span>
                  Inventory utilization is at <strong>{data.inventoryUtilization}%</strong> — consider reviewing stock levels before accepting new orders.
                </span>
              </div>
            )}
          </Section>

          {/* ── 5. Inventory ──────────────────────────────────────────────── */}
          <Section
            icon={<BarChart3 className="w-4 h-4" />}
            title="Inventory Report"
            subtitle="Utilization, stock levels, and damage — valuation exports in Phase 3"
          >
            <StatGrid>
              <Stat
                label="Total Units Owned"
                value={data.totalOwned.toLocaleString()}
                sub="Active catalog items"
              />
              <Stat
                label="Units Currently Out"
                value={data.totalOut.toLocaleString()}
                sub={data.totalOwned > 0 ? `${data.inventoryUtilization}% utilization` : undefined}
              />
              <Stat
                label="Open Damage Reports"
                value={data.openDamages}
                warn={data.openDamages > 0}
                sub="Unresolved / not closed"
              />
              <Stat
                label="Estimated Damage Cost"
                value={formatCurrency(data.damageCost)}
                warn={data.damageCost > 0}
                sub="All time, all reports"
              />
            </StatGrid>

            {data.inventoryUtilization > 0 && (
              <div>
                <SectionLabel>Utilization</SectionLabel>
                <div className="bg-muted/40 rounded-lg px-4 py-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{data.totalOut} units out of {data.totalOwned} owned</span>
                    <span className={`font-semibold ${data.inventoryUtilization > 80 ? 'text-red-600' : data.inventoryUtilization > 50 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {data.inventoryUtilization}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        data.inventoryUtilization > 80 ? 'bg-red-500' :
                        data.inventoryUtilization > 50 ? 'bg-amber-400' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, data.inventoryUtilization)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <SectionLabel>Coming in Phase 3</SectionLabel>
              <div className="space-y-2">
                <PlannedItem
                  title="Inventory Valuation Summary"
                  description="Total purchase cost, replacement value, and estimated current book value across all catalog items."
                />
                <PlannedItem
                  title="Depreciation Schedule"
                  description="Per-item straight-line depreciation breakdown with accumulated depreciation and projected end-of-life."
                />
                <PlannedItem
                  title="Asset Status Report"
                  description="Serialized asset condition tracking — excellent / good / fair / poor / damaged counts by category."
                />
                <PlannedItem
                  title="Low Stock & Reorder Report"
                  description="Items at or below their reorder point, grouped by category, with last rental date."
                />
                <PlannedItem
                  title="Export Inventory to CSV"
                  description="Full catalog export with quantities, costs, and valuation fields."
                />
              </div>
            </div>
          </Section>

        </div>
      )}
    </PageShell>
  )
}
