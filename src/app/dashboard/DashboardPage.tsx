import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  DollarSign, TrendingUp, Clock, Package, Truck, AlertTriangle,
  RotateCcw, Activity, Users, FileText, CheckCircle2, Zap
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { PageShell, StatCard } from '@/components/common/PageShell'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/constants'
import type { RentalOrder, Invoice, Customer } from '@/types/database'

interface DashboardMetrics {
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  outstandingBalance: number
  depositsHeld: number
  activeRentals: number
  upcomingDeliveries: number
  pendingPickups: number
  overdueReturns: number
  overduePickups: number
  disputedReturns: number
  recentOrders: (RentalOrder & { customer: Customer | null })[]
  overdueInvoices: Invoice[]
  lowInventoryItems: { name: string; available: number; owned: number }[]
  upcomingEvents: (RentalOrder & { customer: Customer | null })[]
}

function useDashboardMetrics() {
  const { profile } = useAuth()
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile?.company_id) return
    fetchMetrics(profile.company_id)
  }, [profile?.company_id])

  async function fetchMetrics(companyId: string) {
    setLoading(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

      // Parallel fetches
      const [
        paymentsToday,
        paymentsWeek,
        paymentsMonth,
        activeOrders,
        recentOrders,
        overdueInvoices,
        lowInventory,
        upcomingEvents,
        pendingPickups,
        depositsResult,
        overduePickupsResult,
        disputedReturnsResult,
      ] = await Promise.all([
        // Today revenue
        supabase.from('payments').select('amount').eq('company_id', companyId)
          .eq('status', 'completed').eq('payment_date', today)
          .not('payment_type', 'eq', 'refund'),

        // Week revenue
        supabase.from('payments').select('amount').eq('company_id', companyId)
          .eq('status', 'completed').gte('payment_date', weekAgo)
          .not('payment_type', 'eq', 'refund'),

        // Month revenue
        supabase.from('payments').select('amount').eq('company_id', companyId)
          .eq('status', 'completed').gte('payment_date', monthStart)
          .not('payment_type', 'eq', 'refund'),

        // Active rentals count
        supabase.from('rental_orders').select('id', { count: 'exact' }).eq('company_id', companyId)
          .in('status', ['out_for_delivery', 'setup_in_progress', 'event_active', 'confirmed', 'inventory_reserved']),

        // Recent orders with customer
        supabase.from('rental_orders').select('*, customer:customers(first_name,last_name,company_name)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }).limit(6),

        // Overdue invoices
        supabase.from('invoices').select('*, customer:customers(first_name,last_name)')
          .eq('company_id', companyId).eq('status', 'overdue').limit(5),

        // Low inventory (available < 10% of owned or <3)
        supabase.from('inventory_catalog').select('name,quantity_available,quantity_owned')
          .eq('company_id', companyId).eq('is_active', true)
          .lt('quantity_available', 3).gt('quantity_owned', 0).limit(5),

        // Upcoming events in next 7 days
        supabase.from('rental_orders').select('*, customer:customers(first_name,last_name,company_name)')
          .eq('company_id', companyId)
          .gte('event_date', today).lte('event_date', nextWeek)
          .in('status', ['confirmed', 'inventory_reserved', 'scheduled_for_dispatch'])
          .order('event_date').limit(5),

        // Pending pickups
        supabase.from('rental_orders').select('id', { count: 'exact' })
          .eq('company_id', companyId)
          .in('status', ['pickup_scheduled', 'partially_returned']),

        // Deposits held
        supabase.from('payments').select('amount').eq('company_id', companyId)
          .eq('payment_type', 'security_deposit').eq('status', 'completed'),

        // Overdue pickups: pickup_date passed but still in pickup_scheduled
        supabase.from('rental_orders').select('id', { count: 'exact' })
          .eq('company_id', companyId)
          .eq('status', 'pickup_scheduled')
          .lt('pickup_date', today),

        // Disputed returns
        supabase.from('returns').select('id', { count: 'exact' })
          .eq('company_id', companyId)
          .eq('status', 'disputed'),
      ])

      const sum = (items: { amount: number }[] | null) =>
        (items ?? []).reduce((acc, p) => acc + p.amount, 0)

      // Outstanding balance: sum of balance_due on active orders
      const { data: ordersBalance } = await supabase
        .from('rental_orders').select('balance_due').eq('company_id', companyId)
        .not('status', 'in', '("completed","closed","cancelled","refunded")')

      setMetrics({
        todayRevenue: sum(paymentsToday.data),
        weekRevenue: sum(paymentsWeek.data),
        monthRevenue: sum(paymentsMonth.data),
        outstandingBalance: (ordersBalance ?? []).reduce((a: number, o: { balance_due: number | null }) => a + (o.balance_due || 0), 0),
        depositsHeld: sum(depositsResult.data),
        activeRentals: activeOrders.count ?? 0,
        upcomingDeliveries: upcomingEvents.data?.length ?? 0,
        pendingPickups: pendingPickups.count ?? 0,
        overdueReturns: 0,
        overduePickups: overduePickupsResult.count ?? 0,
        disputedReturns: disputedReturnsResult.count ?? 0,
        recentOrders: (recentOrders.data ?? []) as (RentalOrder & { customer: Customer | null })[],
        overdueInvoices: (overdueInvoices.data ?? []) as Invoice[],
        lowInventoryItems: (lowInventory.data ?? []).map((i: { name: string; quantity_available: number; quantity_owned: number }) => ({
          name: i.name,
          available: i.quantity_available,
          owned: i.quantity_owned,
        })),
        upcomingEvents: (upcomingEvents.data ?? []) as (RentalOrder & { customer: Customer | null })[],
      })
    } catch (err) {
      console.error('Dashboard metrics error:', err)
    } finally {
      setLoading(false)
    }
  }

  return { metrics, loading }
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { appRole } = useAuth()
  const { metrics, loading } = useDashboardMetrics()

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  const name = profile?.full_name?.split(' ')[0] ?? 'there'

  return (
    <PageShell>
      {/* Greeting */}
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          {greeting}, {name} 👋
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* KPI Cards Row 1 — Revenue */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Revenue</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Today"
            value={loading ? '—' : formatCurrency(metrics?.todayRevenue ?? 0)}
            icon={<DollarSign className="w-5 h-5 text-emerald-600" />}
            iconBg="bg-emerald-50"
            colorClass="text-emerald-700"
          />
          <StatCard
            label="This Week"
            value={loading ? '—' : formatCurrency(metrics?.weekRevenue ?? 0)}
            icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
            iconBg="bg-blue-50"
          />
          <StatCard
            label="This Month"
            value={loading ? '—' : formatCurrency(metrics?.monthRevenue ?? 0)}
            icon={<Activity className="w-5 h-5 text-violet-600" />}
            iconBg="bg-violet-50"
          />
          <StatCard
            label="Outstanding"
            value={loading ? '—' : formatCurrency(metrics?.outstandingBalance ?? 0)}
            sub="Across all active orders"
            icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
            iconBg="bg-amber-50"
            colorClass="text-amber-700"
          />
        </div>
      </div>

      {/* KPI Cards Row 2 — Operations */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Operations</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Active Rentals"
            value={loading ? '—' : metrics?.activeRentals ?? 0}
            icon={<Package className="w-5 h-5 text-indigo-600" />}
            iconBg="bg-indigo-50"
          />
          <StatCard
            label="Upcoming Deliveries"
            value={loading ? '—' : metrics?.upcomingDeliveries ?? 0}
            sub="Next 7 days"
            icon={<Truck className="w-5 h-5 text-blue-600" />}
            iconBg="bg-blue-50"
          />
          <StatCard
            label="Pending Pickups"
            value={loading ? '—' : metrics?.pendingPickups ?? 0}
            icon={<RotateCcw className="w-5 h-5 text-orange-600" />}
            iconBg="bg-orange-50"
          />
          <StatCard
            label="Deposits Held"
            value={loading ? '—' : formatCurrency(metrics?.depositsHeld ?? 0)}
            icon={<DollarSign className="w-5 h-5 text-teal-600" />}
            iconBg="bg-teal-50"
          />
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recent Orders */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Recent Orders
            </h3>
            <Link to="/orders" className="text-xs text-primary hover:underline">View all</Link>
          </div>

          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {loading ? (
              <div className="p-4 space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="skeleton w-16 h-4" />
                    <div className="skeleton flex-1 h-4" />
                    <div className="skeleton w-20 h-4" />
                    <div className="skeleton w-16 h-5 rounded-full" />
                  </div>
                ))}
              </div>
            ) : metrics?.recentOrders.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No orders yet</p>
                <Link to="/orders" className="text-xs text-primary hover:underline mt-1 block">Create your first order</Link>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Event Date</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics?.recentOrders.map((order) => {
                    const cust = order.customer as unknown as { first_name: string; last_name: string; company_name?: string } | null
                    return (
                      <tr key={order.id} onClick={() => navigate(`/orders/${order.id}`)} className="cursor-pointer">
                        <td>
                          <span className="font-mono text-xs font-medium text-foreground">{order.order_number}</span>
                        </td>
                        <td>
                          <span className="text-sm text-foreground">
                            {cust ? `${cust.first_name} ${cust.last_name}` : '—'}
                          </span>
                          {cust?.company_name && (
                            <p className="text-xs text-muted-foreground">{cust.company_name}</p>
                          )}
                        </td>
                        <td className="text-sm text-muted-foreground">{formatDate(order.event_date)}</td>
                        <td className="text-sm font-medium">{formatCurrency(order.total_amount)}</td>
                        <td><StatusBadge type="order" status={order.status} size="sm" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Alerts column */}
        <div className="space-y-4">
          {/* Upcoming Events */}
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-muted-foreground" />
              Upcoming Events
            </h3>
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton h-16 rounded-lg" />
                ))
              ) : metrics?.upcomingEvents.length === 0 ? (
                <div className="bg-card rounded-xl border border-border p-4 text-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">No upcoming events this week</p>
                </div>
              ) : metrics?.upcomingEvents.map((order) => {
                const cust = order.customer as unknown as { first_name: string; last_name: string } | null
                return (
                  <Link
                    key={order.id}
                    to={`/orders/${order.id}`}
                    className="flex items-start gap-3 p-3 bg-card rounded-lg border border-border hover:border-primary/30 transition-colors block"
                  >
                    <div className="flex-shrink-0 text-center bg-muted rounded-md px-2 py-1 min-w-[44px]">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase">
                        {order.event_date ? new Date(order.event_date).toLocaleDateString('en-US', { month: 'short' }) : '—'}
                      </p>
                      <p className="text-lg font-bold text-foreground leading-none">
                        {order.event_date ? new Date(order.event_date).getDate() : '—'}
                      </p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {order.event_name || order.order_number}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {cust ? `${cust.first_name} ${cust.last_name}` : 'No customer'}
                      </p>
                      <StatusBadge type="order" status={order.status} size="sm" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>

          {/* Operational Alerts */}
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              Alerts
            </h3>
            <div className="space-y-2">
              {/* Overdue invoices */}
              {(metrics?.overdueInvoices.length ?? 0) > 0 && (
                <Link to="/invoices" className="alert alert-error flex items-start gap-2 no-underline">
                  <FileText className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">{metrics?.overdueInvoices.length} overdue invoice{(metrics?.overdueInvoices.length ?? 0) > 1 ? 's' : ''}</p>
                    <p className="text-xs opacity-80">Review and follow up</p>
                  </div>
                </Link>
              )}

              {/* Low inventory */}
              {(metrics?.lowInventoryItems.length ?? 0) > 0 && (
                <Link to="/inventory" className="alert alert-warning flex items-start gap-2 no-underline">
                  <Package className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Low inventory</p>
                    {metrics?.lowInventoryItems.slice(0, 2).map(item => (
                      <p key={item.name} className="text-xs opacity-80">{item.name} — {item.available} left</p>
                    ))}
                  </div>
                </Link>
              )}

              {/* Overdue pickups */}
              {(metrics?.overduePickups ?? 0) > 0 && (
                <Link to="/orders" className="alert alert-warning flex items-start gap-2 no-underline">
                  <RotateCcw className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {metrics!.overduePickups} overdue pickup{metrics!.overduePickups !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs opacity-80">Pickup date passed — follow up</p>
                  </div>
                </Link>
              )}

              {/* Disputed returns */}
              {(metrics?.disputedReturns ?? 0) > 0 && (
                <Link to="/returns" className="alert alert-error flex items-start gap-2 no-underline">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {metrics!.disputedReturns} disputed return{metrics!.disputedReturns !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs opacity-80">Requires review and resolution</p>
                  </div>
                </Link>
              )}

              {/* All clear */}
              {(metrics?.overdueInvoices.length ?? 0) === 0 &&
               (metrics?.lowInventoryItems.length ?? 0) === 0 &&
               (metrics?.overduePickups ?? 0) === 0 &&
               (metrics?.disputedReturns ?? 0) === 0 &&
               !loading && (
                <div className="bg-card rounded-lg border border-border p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">No active alerts</span>
                </div>
              )}

              {loading && <div className="skeleton h-16 rounded-lg" />}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-muted-foreground" />
              Quick Actions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {/* New Order — staff/admin only */}
              {canEdit(appRole) && (
                <Link
                  to="/orders/new"
                  className="flex items-center gap-2 p-2.5 bg-card rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-medium text-foreground"
                >
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  New Order
                </Link>
              )}
              {/* New Customer — staff/admin only */}
              {canEdit(appRole) && (
                <Link
                  to="/customers/new"
                  className="flex items-center gap-2 p-2.5 bg-card rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-medium text-foreground"
                >
                  <Users className="w-3.5 h-3.5 text-primary" />
                  New Customer
                </Link>
              )}
              {/* Invoices - generated from order detail */}
              <Link
                to="/invoices"
                className="flex items-center gap-2 p-2.5 bg-card rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-medium text-foreground"
              >
                <FileText className="w-3.5 h-3.5 text-primary" />
                View Invoices
              </Link>
              {/* Payments - recorded from invoice detail */}
              <Link
                to="/payments"
                className="flex items-center gap-2 p-2.5 bg-card rounded-lg border border-border hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-medium text-foreground"
              >
                <DollarSign className="w-3.5 h-3.5 text-primary" />
                View Payments
              </Link>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
