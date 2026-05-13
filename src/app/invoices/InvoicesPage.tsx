import { ChangeEvent } from 'react'
import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, FileText, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar, StatCard } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate, INVOICE_STATUS_CONFIG } from '@/lib/constants'
import type { Invoice, Customer, RentalOrder } from '@/types/database'

type InvoiceWithJoins = Invoice & {
  customer: Pick<Customer, 'first_name' | 'last_name' | 'company_name'> | null
  order: Pick<RentalOrder, 'order_number' | 'event_name'> | null
}

const STATUS_TABS = [
  { label: 'All',      value: '' },
  { label: 'Draft',    value: 'draft' },
  { label: 'Sent',     value: 'sent' },
  { label: 'Partial',  value: 'partial' },
  { label: 'Paid',     value: 'paid' },
  { label: 'Overdue',  value: 'overdue' },
]

export default function InvoicesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [invoices, setInvoices] = useState<InvoiceWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('issue_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Summary stats
  const [stats, setStats] = useState({
    totalDue: 0,
    overdueDue: 0,
    paidThisMonth: 0,
    draftCount: 0,
  })

  const fetchInvoices = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      let query = supabase
        .from('invoices')
        .select(
          `*,
           customer:customers(first_name, last_name, company_name),
           order:rental_orders(order_number, event_name)`,
          { count: 'exact' }
        )
        .eq('company_id', profile.company_id)

      if (statusFilter) query = query.eq('status', statusFilter)

      if (search) {
        query = query.or(
          `invoice_number.ilike.%${search}%`
        )
      }

      query = query.order(sortKey, { ascending: sortDir === 'asc' }).limit(50)

      const { data, error, count } = await query
      if (error) throw error

      const rows = (data ?? []) as InvoiceWithJoins[]
      setInvoices(rows)
      setTotal(count ?? 0)

      // Compute stats
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]

      const [overdueRes, paidRes, draftRes] = await Promise.all([
        supabase.from('invoices').select('balance_due').eq('company_id', profile.company_id).eq('status', 'overdue'),
        supabase.from('invoices').select('amount_paid').eq('company_id', profile.company_id).eq('status', 'paid').gte('paid_at', monthStart),
        supabase.from('invoices').select('id', { count: 'exact' }).eq('company_id', profile.company_id).eq('status', 'draft'),
      ])

      setStats({
        totalDue: rows.filter(i => ['sent','partial','overdue'].includes(i.status)).reduce((a, i) => a + i.balance_due, 0),
        overdueDue: (overdueRes.data ?? []).reduce((a: number, i: { balance_due: number }) => a + i.balance_due, 0),
        paidThisMonth: (paidRes.data ?? []).reduce((a: number, i: { amount_paid: number }) => a + i.amount_paid, 0),
        draftCount: draftRes.count ?? 0,
      })
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, search, statusFilter, sortKey, sortDir])

  useEffect(() => {
    const timer = setTimeout(fetchInvoices, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchInvoices, search])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const columns = [
    {
      key: 'invoice_number',
      label: 'Invoice #',
      sortable: true,
      width: '130px',
      render: (row: InvoiceWithJoins) => (
        <span className="font-mono text-xs font-semibold text-foreground">{row.invoice_number}</span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row: InvoiceWithJoins) => {
        const c = row.customer
        if (!c) return <span className="text-xs text-muted-foreground">—</span>
        return (
          <div>
            <p className="text-sm font-medium text-foreground">{c.first_name} {c.last_name}</p>
            {c.company_name && <p className="text-xs text-muted-foreground">{c.company_name}</p>}
          </div>
        )
      },
    },
    {
      key: 'order',
      label: 'Order',
      render: (row: InvoiceWithJoins) => (
        <span className="text-xs font-mono text-muted-foreground">
          {row.order?.order_number ?? '—'}
        </span>
      ),
    },
    {
      key: 'issue_date',
      label: 'Issue Date',
      sortable: true,
      render: (row: InvoiceWithJoins) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.issue_date)}</span>
      ),
    },
    {
      key: 'due_date',
      label: 'Due Date',
      sortable: true,
      render: (row: InvoiceWithJoins) => {
        const isOverdue = row.status === 'overdue'
        return (
          <span className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            {formatDate(row.due_date)}
          </span>
        )
      },
    },
    {
      key: 'total',
      label: 'Total',
      sortable: true,
      align: 'right' as const,
      render: (row: InvoiceWithJoins) => (
        <span className="text-sm font-medium text-foreground">{formatCurrency(row.total)}</span>
      ),
    },
    {
      key: 'amount_paid',
      label: 'Paid',
      align: 'right' as const,
      render: (row: InvoiceWithJoins) => (
        <span className="text-sm text-emerald-600">{formatCurrency(row.amount_paid)}</span>
      ),
    },
    {
      key: 'balance_due',
      label: 'Balance',
      sortable: true,
      align: 'right' as const,
      render: (row: InvoiceWithJoins) => (
        <span className={`text-sm font-medium ${row.balance_due > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
          {row.balance_due > 0 ? formatCurrency(row.balance_due) : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row: InvoiceWithJoins) => <StatusBadge type="invoice" status={row.status} />,
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Invoices"
        subtitle={`${total} total invoice${total !== 1 ? 's' : ''}`}
        actions={
          <button onClick={() => navigate('/invoices/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Invoice
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Outstanding"
          value={loading ? '—' : formatCurrency(stats.totalDue)}
          sub="Sent + partial"
          icon={<FileText className="w-5 h-5 text-amber-600" />}
          iconBg="bg-amber-50"
          colorClass="text-amber-700"
        />
        <StatCard
          label="Overdue"
          value={loading ? '—' : formatCurrency(stats.overdueDue)}
          icon={<FileText className="w-5 h-5 text-red-600" />}
          iconBg="bg-red-50"
          colorClass={stats.overdueDue > 0 ? 'text-red-700' : 'text-foreground'}
        />
        <StatCard
          label="Collected This Month"
          value={loading ? '—' : formatCurrency(stats.paidThisMonth)}
          icon={<FileText className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          colorClass="text-emerald-700"
        />
        <StatCard
          label="Drafts"
          value={loading ? '—' : stats.draftCount}
          sub="Not yet sent"
          icon={<FileText className="w-5 h-5 text-slate-500" />}
          iconBg="bg-slate-100"
        />
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              statusFilter === tab.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <TableCard>
        <TableToolbar>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search invoice number..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <select
              value={statusFilter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
              className="form-select h-9 text-sm w-40"
            >
              <option value="">All Statuses</option>
              {Object.entries(INVOICE_STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{invoices.length} shown</p>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={invoices}
          keyField="id"
          onRowClick={(row) => navigate(`/invoices/${row.id}`)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyTitle="No invoices found"
          emptyDescription={search || statusFilter ? 'Try adjusting your filters.' : 'Create your first invoice to start billing customers.'}
        />
      </TableCard>

      {!loading && invoices.length === 0 && !search && !statusFilter && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FileText className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No invoices yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Create invoices from rental orders to bill customers for deposits and final payments.
          </p>
          <button onClick={() => navigate('/invoices/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Create First Invoice
          </button>
        </div>
      )}
    </PageShell>
  )
}
