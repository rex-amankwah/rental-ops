import { ChangeEvent, useEffect, useState, useCallback } from 'react'
import { Search, Plus, CreditCard, SlidersHorizontal, TrendingUp, DollarSign, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar, StatCard } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { formatCurrency, formatDate, PAYMENT_METHODS } from '@/lib/constants'
import type { Payment, Customer, RentalOrder, Invoice } from '@/types/database'

type PaymentWithJoins = Payment & {
  customer: Pick<Customer, 'first_name' | 'last_name' | 'company_name'> | null
  order: Pick<RentalOrder, 'order_number' | 'event_name'> | null
  invoice: Pick<Invoice, 'invoice_number'> | null
}

const PAYMENT_TYPE_LABELS: Record<string, string> = {
  deposit:          'Deposit',
  payment:          'Payment',
  partial_payment:  'Partial Payment',
  refund:           'Refund',
  security_deposit: 'Security Deposit',
  security_refund:  'Security Refund',
}

const TYPE_TABS = [
  { label: 'All',      value: '' },
  { label: 'Payments', value: 'payment' },
  { label: 'Deposits', value: 'deposit' },
  { label: 'Refunds',  value: 'refund' },
]

export default function PaymentsPage() {
  const { profile } = useAuth()
  const [payments, setPayments] = useState<PaymentWithJoins[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('payment_date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const [stats, setStats] = useState({
    totalThisMonth: 0,
    totalRefunds: 0,
    cashDeposits: 0,
    cardPayments: 0,
  })

  const fetchPayments = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0]

      let query = supabase
        .from('payments')
        .select(
          `*,
           customer:customers(first_name, last_name, company_name),
           order:rental_orders(order_number, event_name),
           invoice:invoices(invoice_number)`,
          { count: 'exact' }
        )
        .eq('company_id', profile.company_id)
        .eq('status', 'completed')

      if (typeFilter === 'refund') {
        query = query.eq('payment_type', 'refund')
      } else if (typeFilter === 'deposit') {
        query = query.in('payment_type', ['deposit', 'security_deposit'])
      } else if (typeFilter === 'payment') {
        query = query.in('payment_type', ['payment', 'partial_payment'])
      }

      if (methodFilter) query = query.eq('method', methodFilter)

      if (search) {
        query = query.or(`reference.ilike.%${search}%,notes.ilike.%${search}%`)
      }

      query = query.order(sortKey, { ascending: sortDir === 'asc' }).limit(100)

      const { data, error, count } = await query
      if (error) throw error

      setPayments((data ?? []) as PaymentWithJoins[])
      setTotal(count ?? 0)

      // Stats for this month
      const [monthPayments, monthRefunds, cashDep, cardPay] = await Promise.all([
        supabase.from('payments').select('amount')
          .eq('company_id', profile.company_id).eq('status', 'completed')
          .not('payment_type', 'eq', 'refund').gte('payment_date', monthStart),
        supabase.from('payments').select('amount')
          .eq('company_id', profile.company_id).eq('status', 'completed')
          .eq('payment_type', 'refund').gte('payment_date', monthStart),
        supabase.from('payments').select('amount')
          .eq('company_id', profile.company_id).eq('status', 'completed')
          .eq('method', 'cash').gte('payment_date', monthStart),
        supabase.from('payments').select('amount')
          .eq('company_id', profile.company_id).eq('status', 'completed')
          .eq('method', 'card').gte('payment_date', monthStart),
      ])

      const sum = (arr: { amount: number }[] | null) =>
        (arr ?? []).reduce((a, p) => a + p.amount, 0)

      setStats({
        totalThisMonth: sum(monthPayments.data),
        totalRefunds: sum(monthRefunds.data),
        cashDeposits: sum(cashDep.data),
        cardPayments: sum(cardPay.data),
      })
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, search, typeFilter, methodFilter, sortKey, sortDir])

  useEffect(() => {
    const timer = setTimeout(fetchPayments, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchPayments, search])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const columns = [
    {
      key: 'payment_date',
      label: 'Date',
      sortable: true,
      render: (row: PaymentWithJoins) => (
        <span className="text-sm text-foreground">{formatDate(row.payment_date)}</span>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (row: PaymentWithJoins) => {
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
      label: 'Order / Invoice',
      render: (row: PaymentWithJoins) => (
        <div>
          {row.order && (
            <p className="text-xs font-mono text-foreground">{row.order.order_number}</p>
          )}
          {row.invoice && (
            <p className="text-xs font-mono text-muted-foreground">{row.invoice.invoice_number}</p>
          )}
          {!row.order && !row.invoice && <span className="text-xs text-muted-foreground">—</span>}
        </div>
      ),
    },
    {
      key: 'payment_type',
      label: 'Type',
      sortable: true,
      render: (row: PaymentWithJoins) => (
        <span className={`badge text-xs ${
          row.payment_type === 'refund' || row.payment_type === 'security_refund'
            ? 'bg-red-100 text-red-700'
            : row.payment_type === 'deposit' || row.payment_type === 'security_deposit'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-emerald-100 text-emerald-700'
        }`}>
          {PAYMENT_TYPE_LABELS[row.payment_type] ?? row.payment_type}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      sortable: true,
      render: (row: PaymentWithJoins) => (
        <span className="text-sm capitalize text-foreground">{row.method}</span>
      ),
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (row: PaymentWithJoins) => (
        <span className="text-xs font-mono text-muted-foreground">{row.reference || '—'}</span>
      ),
    },
    {
      key: 'amount',
      label: 'Amount',
      sortable: true,
      align: 'right' as const,
      render: (row: PaymentWithJoins) => {
        const isRefund = row.payment_type === 'refund' || row.payment_type === 'security_refund'
        return (
          <span className={`text-sm font-semibold ${isRefund ? 'text-red-600' : 'text-emerald-600'}`}>
            {isRefund ? '-' : '+'}{formatCurrency(row.amount)}
          </span>
        )
      },
    },
    {
      key: 'notes',
      label: 'Notes',
      render: (row: PaymentWithJoins) => (
        <span className="text-xs text-muted-foreground truncate max-w-[150px] block">{row.notes || '—'}</span>
      ),
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Payments"
        subtitle={`${total} payment record${total !== 1 ? 's' : ''}`}
        actions={
          <div className="relative group">
            <button disabled className="btn-primary opacity-50 cursor-not-allowed">
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
            <div className="absolute right-0 top-10 hidden group-hover:block z-10 w-60 bg-foreground text-background text-xs rounded-lg px-3 py-2 shadow-lg">
              Record payments from an invoice's detail page.
            </div>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Collected This Month"
          value={loading ? '—' : formatCurrency(stats.totalThisMonth)}
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          iconBg="bg-emerald-50"
          colorClass="text-emerald-700"
        />
        <StatCard
          label="Refunds This Month"
          value={loading ? '—' : formatCurrency(stats.totalRefunds)}
          icon={<RotateCcw className="w-5 h-5 text-red-600" />}
          iconBg="bg-red-50"
          colorClass={stats.totalRefunds > 0 ? 'text-red-700' : 'text-foreground'}
        />
        <StatCard
          label="Cash This Month"
          value={loading ? '—' : formatCurrency(stats.cashDeposits)}
          icon={<DollarSign className="w-5 h-5 text-slate-600" />}
          iconBg="bg-slate-100"
        />
        <StatCard
          label="Card This Month"
          value={loading ? '—' : formatCurrency(stats.cardPayments)}
          icon={<CreditCard className="w-5 h-5 text-blue-600" />}
          iconBg="bg-blue-50"
        />
      </div>

      {/* Type tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setTypeFilter(tab.value)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              typeFilter === tab.value
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
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search reference, notes..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-9"
            />
          </div>

          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
            <select
              value={methodFilter}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMethodFilter(e.target.value)}
              className="form-select h-9 text-sm w-40"
            >
              <option value="">All Methods</option>
              {PAYMENT_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{payments.length} shown</p>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={payments}
          keyField="id"
          onRowClick={undefined}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyTitle="No payments found"
          emptyDescription={search || typeFilter ? 'Try adjusting your filters.' : 'Record your first payment to track collections.'}
        />
      </TableCard>

      {!loading && payments.length === 0 && !search && !typeFilter && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <CreditCard className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No payments recorded</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Record deposits, partial payments, and final collections here.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Record payments from an invoice's detail page.
          </p>
        </div>
      )}
    </PageShell>
  )
}
