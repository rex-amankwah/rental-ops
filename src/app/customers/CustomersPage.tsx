import { useEffect, useState, useCallback, ChangeEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, Users, Mail, Phone, Building2, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard, TableToolbar } from '@/components/common/PageShell'
import { DataTable } from '@/components/common/DataTable'
import Modal from '@/components/common/Modal'
import { formatCurrency, formatDate } from '@/lib/constants'
import type { Customer } from '@/types/database'

// ─── New Customer Modal ───────────────────────────────────────────────────────

interface NewCustomerForm {
  first_name: string
  last_name: string
  email: string
  phone: string
  company_name: string
  billing_city: string
  billing_state: string
}

const BLANK_FORM: NewCustomerForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  company_name: '',
  billing_city: '',
  billing_state: '',
}

interface NewCustomerModalProps {
  open: boolean
  onClose: () => void
  onSaved: () => void
}

function NewCustomerModal({ open, onClose, onSaved }: NewCustomerModalProps) {
  const { profile } = useAuth()
  const [form, setForm] = useState<NewCustomerForm>(BLANK_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<NewCustomerForm>>({})

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setForm(BLANK_FORM)
      setError(null)
      setFieldErrors({})
    }
  }, [open])

  function set(field: keyof NewCustomerForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    // Clear field error on change
    if (fieldErrors[field]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[field]; return n })
    }
  }

  function validate(): boolean {
    const errors: Partial<NewCustomerForm> = {}
    if (!form.first_name.trim()) errors.first_name = 'First name is required'
    if (!form.last_name.trim()) errors.last_name = 'Last name is required'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Enter a valid email address'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    if (!profile?.company_id) {
      setError('No company found. Please reload the page.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const { error: insertError } = await supabase.from('customers').insert({
        company_id:   profile.company_id,
        first_name:   form.first_name.trim(),
        last_name:    form.last_name.trim(),
        email:        form.email.trim() || null,
        phone:        form.phone.trim() || null,
        company_name: form.company_name.trim() || null,
        billing_city: form.billing_city.trim() || null,
        billing_state: form.billing_state.trim().toUpperCase() || null,
        is_active:    true,
        total_orders: 0,
        total_spent:  0,
      })

      if (insertError) {
        console.error('[NewCustomerModal] Insert error:', insertError)
        throw insertError
      }

      onSaved()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to save customer: ${msg}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Customer"
      subtitle="Add a customer to your account"
      size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary" disabled={saving}>
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Plus className="w-4 h-4" /> Add Customer</>
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Global error */}
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="form-label">
              First Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.first_name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('first_name', e.target.value)}
              placeholder="Maria"
              className={`form-input ${fieldErrors.first_name ? 'border-red-400' : ''}`}
              autoFocus
            />
            {fieldErrors.first_name && (
              <p className="text-xs text-red-600">{fieldErrors.first_name}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="form-label">
              Last Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.last_name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('last_name', e.target.value)}
              placeholder="Rodriguez"
              className={`form-input ${fieldErrors.last_name ? 'border-red-400' : ''}`}
            />
            {fieldErrors.last_name && (
              <p className="text-xs text-red-600">{fieldErrors.last_name}</p>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="form-label">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set('email', e.target.value)}
            placeholder="maria@example.com"
            className={`form-input ${fieldErrors.email ? 'border-red-400' : ''}`}
          />
          {fieldErrors.email && (
            <p className="text-xs text-red-600">{fieldErrors.email}</p>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="form-label">Phone</label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set('phone', e.target.value)}
            placeholder="(713) 555-0100"
            className="form-input"
          />
        </div>

        {/* Company name */}
        <div className="space-y-1.5">
          <label className="form-label">Company Name</label>
          <input
            type="text"
            value={form.company_name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set('company_name', e.target.value)}
            placeholder="Optional — for business customers"
            className="form-input"
          />
        </div>

        {/* City + State */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="form-label">City</label>
            <input
              type="text"
              value={form.billing_city}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('billing_city', e.target.value)}
              placeholder="Houston"
              className="form-input"
            />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">State</label>
            <input
              type="text"
              value={form.billing_state}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('billing_state', e.target.value)}
              placeholder="TX"
              maxLength={2}
              className="form-input"
            />
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [sortKey, setSortKey] = useState('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showNewModal, setShowNewModal] = useState(false)

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
          <button onClick={() => setShowNewModal(true)} className="btn-primary">
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
          <button onClick={() => setShowNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Add First Customer
          </button>
        </div>
      )}

      {/* New Customer Modal */}
      <NewCustomerModal
        open={showNewModal}
        onClose={() => setShowNewModal(false)}
        onSaved={fetchCustomers}
      />
    </PageShell>
  )
}
