import { ChangeEvent, MouseEvent, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, SlidersHorizontal, Plus, ClipboardList, Truck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate, ORDER_STATUS_CONFIG } from '@/lib/constants'
import { canEdit } from '@/lib/roles'
import type { RentalOrder, Customer, OrderStatus } from '@/types/database'

type OrderWithCustomer = RentalOrder & { customer: Customer | null }

const STATUS_GROUPS = [
  { label: 'All', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Pre-Event', value: 'pre_event' },
  { label: 'Post-Event', value: 'post_event' },
  { label: 'Closed', value: 'closed' },
]

const ACTIVE_STATUSES: OrderStatus[] = [
  'out_for_delivery','setup_in_progress','event_active'
]
const PRE_EVENT_STATUSES: OrderStatus[] = [
  'inquiry','quote_sent','awaiting_deposit','confirmed','inventory_reserved','scheduled_for_dispatch'
]
const POST_EVENT_STATUSES: OrderStatus[] = [
  'pickup_scheduled','returned','inspection','partially_returned','damaged','overdue'
]
const CLOSED_STATUSES: OrderStatus[] = [
  'completed','closed','cancelled','refunded'
]

const DISPATCH_ELIGIBLE = new Set<string>(['confirmed', 'inventory_reserved', 'awaiting_deposit'])
const TERMINAL_ORDER    = new Set<string>(['returned', 'completed', 'cancelled', 'refunded', 'closed'])

const DISPATCH_BADGE: Record<string, { label: string; cls: string }> = {
  scheduled:        { label: 'Scheduled',       cls: 'bg-blue-100 text-blue-700' },
  loading:          { label: 'On Board',         cls: 'bg-violet-100 text-violet-700' },
  out_for_delivery: { label: 'Out for Delivery', cls: 'bg-amber-100 text-amber-700' },
  delivered:        { label: 'Delivered',        cls: 'bg-emerald-100 text-emerald-700' },
  setup_done:       { label: 'Delivered',        cls: 'bg-emerald-100 text-emerald-700' },
  pickup_pending:   { label: 'Pickup Pending',   cls: 'bg-orange-100 text-orange-700' },
  returned:         { label: 'Returned',         cls: 'bg-muted text-muted-foreground' },
}

export default function OrdersPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusGroup, setStatusGroup] = useState('')
  const [specificStatus, setSpecificStatus] = useState('')
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [total, setTotal] = useState(0)
  const [dispatchMap, setDispatchMap] = useState<Map<string, string>>(new Map())

  const fetchOrders = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      let query = supabase
        .from('rental_orders')
        .select('*, customer:customers(first_name,last_name,company_name,email,phone)', { count: 'exact' })
        .eq('company_id', profile.company_id)

      // Status filter
      if (specificStatus) {
        query = query.eq('status', specificStatus)
      } else if (statusGroup === 'active') {
        query = query.in('status', ACTIVE_STATUSES)
      } else if (statusGroup === 'pre_event') {
        query = query.in('status', PRE_EVENT_STATUSES)
      } else if (statusGroup === 'post_event') {
        query = query.in('status', POST_EVENT_STATUSES)
      } else if (statusGroup === 'closed') {
        query = query.in('status', CLOSED_STATUSES)
      }

      // Search
      if (search) {
        query = query.or(
          `order_number.ilike.%${search}%,event_name.ilike.%${search}%,venue_name.ilike.%${search}%`
        )
      }

      // Sort
      query = query.order(sortKey, { ascending: sortDir === 'asc' }).limit(50)

      const { data, error, count } = await query
      if (error) throw error
      setOrders((data ?? []) as OrderWithCustomer[])
      setTotal(count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, search, statusGroup, specificStatus, sortKey, sortDir])

  useEffect(() => {
    const timer = setTimeout(fetchOrders, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchOrders, search])

  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('dispatches').select('order_id,status')
      .eq('company_id', profile.company_id).neq('status', 'cancelled')
      .then(({ data }) => {
        const m = new Map<string, string>()
        for (const d of data ?? []) m.set(d.order_id as string, d.status as string)
        setDispatchMap(m)
      })
  }, [profile?.company_id])

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const columns = [
    {
      key: 'order_number',
      label: 'Order #',
      sortable: true,
      width: '110px',
      render: (row: OrderWithCustomer) => (
        <span className="font-mono text-xs font-semibold text-foreground whitespace-nowrap">{row.order_number}</span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      width: '160px',
      render: (row: OrderWithCustomer) => {
        const c = row.customer as unknown as { first_name: string; last_name: string; company_name?: string } | null
        if (!c) return <span className="text-muted-foreground text-xs">No customer</span>
        return (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate max-w-[140px]">{c.first_name} {c.last_name}</p>
            {c.company_name && (
              <p className="text-xs text-muted-foreground truncate max-w-[140px]">{c.company_name}</p>
            )}
          </div>
        )
      },
    },
    {
      key: 'event_name',
      label: 'Event',
      width: '160px',
      render: (row: OrderWithCustomer) => (
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate max-w-[140px]">{row.event_name || '—'}</p>
          {row.event_type && (
            <p className="text-xs text-muted-foreground capitalize">{row.event_type}</p>
          )}
        </div>
      ),
    },
    {
      key: 'event_date',
      label: 'Event Date',
      sortable: true,
      width: '110px',
      render: (row: OrderWithCustomer) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.event_date)}</span>
      ),
    },
    {
      key: 'total_amount',
      label: 'Financials',
      sortable: true,
      align: 'right' as const,
      width: '120px',
      render: (row: OrderWithCustomer) => (
        <div className="text-right whitespace-nowrap space-y-0.5">
          <p className="text-sm font-medium text-foreground">{formatCurrency(row.total_amount)}</p>
          {(row.amount_paid ?? 0) > 0 && (
            <p className="text-xs text-emerald-600">Paid {formatCurrency(row.amount_paid)}</p>
          )}
          {row.balance_due > 0 && (
            <p className="text-xs text-red-600">Due {formatCurrency(row.balance_due)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Order Status',
      width: '130px',
      render: (row: OrderWithCustomer) => <StatusBadge type="order" status={row.status} />,
    },
    {
      key: 'dispatch_action',
      label: 'Dispatch Status',
      width: '140px',
      render: (row: OrderWithCustomer) => {
        // Never show dispatch state for terminal orders
        if (TERMINAL_ORDER.has(row.status)) return null

        const dispatchStatus = dispatchMap.get(row.id)
        if (dispatchStatus) {
          const cfg = DISPATCH_BADGE[dispatchStatus] ?? { label: dispatchStatus, cls: 'bg-muted text-muted-foreground' }
          return (
            <button
              onClick={(e: MouseEvent) => { e.stopPropagation(); navigate('/dispatch') }}
              className={`badge text-[10px] whitespace-nowrap ${cfg.cls} hover:opacity-80 transition-opacity cursor-pointer`}
            >
              {cfg.label}
            </button>
          )
        }

        if (!DISPATCH_ELIGIBLE.has(row.status) || !canEdit(appRole)) return null
        return (
          <button
            onClick={(e: MouseEvent) => { e.stopPropagation(); navigate(`/dispatch/new?orderId=${row.id}`) }}
            className="btn-secondary text-xs py-1 px-2.5 flex items-center gap-1 whitespace-nowrap"
          >
            <Truck className="w-3 h-3" />
            Dispatch
          </button>
        )
      },
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Orders"
        subtitle={`${total} total order${total !== 1 ? 's' : ''}`}
        actions={canEdit(appRole) ? (
          <button onClick={() => navigate('/orders/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Order
          </button>
        ) : undefined}
      />

      {/* Status group tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {STATUS_GROUPS.map((g) => (
          <button
            key={g.value}
            onClick={() => { setStatusGroup(g.value); setSpecificStatus('') }}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              statusGroup === g.value && !specificStatus
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      <TableCard>
        <TableToolbar>
          {/* Search */}
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search orders..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-9"
            />
          </div>

          {/* Specific status filter */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <select
              value={specificStatus}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => { setSpecificStatus(e.target.value); setStatusGroup('') }}
              className="form-select h-9 text-sm w-48"
            >
              <option value="">All Statuses</option>
              {Object.entries(ORDER_STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{orders.length} shown</p>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={orders}
          keyField="id"
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyTitle="No orders found"
          emptyDescription={search ? 'Try a different search term.' : 'Create your first rental order to get started.'}
        />
      </TableCard>

      {/* Empty state CTA */}
      {!loading && orders.length === 0 && !search && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <ClipboardList className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No orders yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Create your first rental order to start tracking events, inventory, and invoices.
          </p>
          <button onClick={() => navigate('/orders/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Order
          </button>
        </div>
      )}
    </PageShell>
  )
}
