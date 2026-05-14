import { useEffect, useState, useCallback, ChangeEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Users, Mail, Phone, Building2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import { formatCurrency, formatDate } from '@/lib/constants'
import type { Customer } from '@/types/database'

export default function CustomersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const fetchCustomers = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .eq('company_id', profile.company_id)
        .eq('is_active', true)

      if (search) {
        query = query.or(
          `first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%,phone.ilike.%${search}%`
        )
      }

      query = query.order(sortKey, { ascending: sortDir === 'asc' }).limit(50)

      const { data, error, count } = await query
      if (error) throw error
      setCustomers(data ?? [])
      setTotal(count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id, search, sortKey, sortDir])

  useEffect(() => {
    const timer = setTimeout(fetchCustomers, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [fetchCustomers, search])

  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: false,
      render: (row: Customer) => (
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-semibold text-primary">
              {row.first_name[0]}{row.last_name[0]}
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{row.first_name} {row.last_name}</p>
            {row.company_name && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" /> {row.company_name}
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'email',
      label: 'Contact',
      render: (row: Customer) => (
        <div className="space-y-0.5">
          {row.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Mail className="w-3 h-3" />
              <a href={`mailto:${row.email}`} onClick={(e: MouseEvent) => e.stopPropagation()} className="hover:text-foreground">
                {row.email}
              </a>
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Phone className="w-3 h-3" />
              <a href={`tel:${row.phone}`} onClick={(e: MouseEvent) => e.stopPropagation()} className="hover:text-foreground">
                {row.phone}
              </a>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'billing_city',
      label: 'Location',
      render: (row: Customer) => (
        <span className="text-sm text-muted-foreground">
          {[row.billing_city, row.billing_state].filter(Boolean).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'total_orders',
      label: 'Orders',
      sortable: true,
      align: 'right' as const,
      render: (row: Customer) => (
        <span className="text-sm font-medium text-foreground">{row.total_orders}</span>
      ),
    },
    {
      key: 'total_spent',
      label: 'Total Spent',
      sortable: true,
      align: 'right' as const,
      render: (row: Customer) => (
        <span className="text-sm font-medium text-foreground">{formatCurrency(row.total_spent)}</span>
      ),
    },
    {
      key: 'created_at',
      label: 'Customer Since',
      sortable: true,
      render: (row: Customer) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'tags',
      label: 'Tags',
      render: (row: Customer) => (
        <div className="flex gap-1 flex-wrap">
          {(row.tags ?? []).slice(0, 2).map(tag => (
            <span key={tag} className="badge bg-muted text-muted-foreground text-[10px]">{tag}</span>
          ))}
        </div>
      ),
    },
  ]

  return (
    <PageShell>
      <PageHeader
        title="Customers"
        subtitle={`${total} total customer${total !== 1 ? 's' : ''}`}
        actions={
          <button onClick={() => navigate('/customers/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Customer
          </button>
        }
      />

      <TableCard>
        <TableToolbar>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search customers..."
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-9"
            />
          </div>
          <div className="flex-1" />
          <p className="text-xs text-muted-foreground">{customers.length} shown</p>
        </TableToolbar>

        <DataTable
          columns={columns}
          data={customers}
          keyField="id"
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={handleSort}
          loading={loading}
          emptyTitle="No customers found"
          emptyDescription={search ? 'Try a different search term.' : 'Add your first customer to get started.'}
        />
      </TableCard>

      {!loading && customers.length === 0 && !search && (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Users className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No customers yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Add customers to start creating orders and tracking rental history.
          </p>
          <button onClick={() => navigate('/customers/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add First Customer
          </button>
        </div>
      )}

    </PageShell>
  )
}
