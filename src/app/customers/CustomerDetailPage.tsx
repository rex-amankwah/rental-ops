import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Mail, Phone, MapPin, Building2,
  ClipboardList, DollarSign, Calendar, Users, Loader2, Pencil
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatCurrency, formatDate } from '@/lib/constants'
import type { Customer, RentalOrder } from '@/types/database'

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile, appRole } = useAuth()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const fetchCustomer = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    setNotFound(false)
    try {
      // Fetch customer
      const { data: custData, error: custErr } = await supabase
        .from('customers')
        .select('*')
        .eq('id', id)
        .eq('company_id', profile.company_id)
        .single()

      if (custErr || !custData) {
        console.error('[CustomerDetailPage] fetch error:', custErr)
        setNotFound(true)
        return
      }
      setCustomer(custData as Customer)

      // Fetch related orders
      const { data: orderData } = await supabase
        .from('rental_orders')
        .select('id, order_number, event_name, event_date, status, total_amount, balance_due, created_at')
        .eq('customer_id', id)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(50)

      setOrders((orderData ?? []) as RentalOrder[])
    } catch (err) {
      console.error('[CustomerDetailPage] unexpected error:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id, profile?.company_id])

  useEffect(() => { fetchCustomer() }, [fetchCustomer])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (notFound || !customer) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">
          <Users className="w-7 h-7 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Customer not found</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          This customer doesn't exist or you don't have access to it.
        </p>
        <button onClick={() => navigate('/customers')} className="btn-primary">
          Back to Customers
        </button>
      </div>
    )
  }

  const totalOrders = orders.length
  const totalSpent  = orders
    .filter(o => !['cancelled', 'refunded'].includes(o.status))
    .reduce((a, o) => a + (o.total_amount ?? 0), 0)
  const outstanding = orders
    .filter(o => !['cancelled', 'refunded', 'completed', 'closed'].includes(o.status))
    .reduce((a, o) => a + (o.balance_due ?? 0), 0)

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={() => navigate('/customers')} className="btn-ghost p-2 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-primary">
                {customer.first_name[0]}{customer.last_name[0]}
              </span>
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">
                {customer.first_name} {customer.last_name}
              </h1>
              {customer.company_name && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3.5 h-3.5" /> {customer.company_name}
                </p>
              )}
            </div>
          </div>
        </div>
        {canEdit(appRole) && (
          <button onClick={() => navigate(`/customers/${customer.id}/edit`)} className="btn-secondary">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Orders</p>
              <p className="text-2xl font-semibold mt-1 leading-none">{totalOrders}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Spent</p>
              <p className="text-2xl font-semibold mt-1 leading-none text-emerald-700">{formatCurrency(totalSpent)}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
        </div>
        <div className="kpi-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outstanding</p>
              <p className={`text-2xl font-semibold mt-1 leading-none ${outstanding > 0 ? 'text-red-600' : 'text-foreground'}`}>
                {formatCurrency(outstanding)}
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Detail grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Contact info */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact</h3>
          {customer.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <a href={`mailto:${customer.email}`} className="text-primary hover:underline truncate">
                {customer.email}
              </a>
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
            </div>
          )}
          {customer.phone_alt && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="text-muted-foreground">{customer.phone_alt} (alt)</span>
            </div>
          )}
          {!customer.email && !customer.phone && (
            <p className="text-sm text-muted-foreground">No contact info</p>
          )}
        </div>

        {/* Billing address */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Billing Address</h3>
          {(customer.billing_address || customer.billing_city || customer.billing_state) ? (
            <div className="flex items-start gap-2 text-sm text-foreground">
              <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                {customer.billing_address && <p>{customer.billing_address}</p>}
                {(customer.billing_city || customer.billing_state) && (
                  <p>{[customer.billing_city, customer.billing_state, customer.billing_zip].filter(Boolean).join(', ')}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No address on file</p>
          )}
        </div>

        {/* Meta */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 flex-shrink-0">Source</span>
              <span className="text-foreground capitalize">{customer.source || '—'}</span>
            </div>
            <div className="flex gap-2">
              <span className="text-muted-foreground w-24 flex-shrink-0">Customer since</span>
              <span className="text-foreground">{formatDate(customer.created_at)}</span>
            </div>
            {customer.tags && customer.tags.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-24 flex-shrink-0">Tags</span>
                <div className="flex gap-1 flex-wrap">
                  {customer.tags.map(t => (
                    <span key={t} className="badge bg-muted text-muted-foreground text-[10px]">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {customer.notes && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">{customer.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Orders table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            Order History
          </h3>
          {canEdit(appRole) && (
            <Link to="/orders/new" className="btn-primary text-xs h-8 px-3">
              <ClipboardList className="w-3.5 h-3.5" />
              New Order
            </Link>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-10 text-center">
            <ClipboardList className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No orders yet for this customer.</p>
          </div>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Event</th>
                  <th>Event Date</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(order => (
                  <tr
                    key={order.id}
                    onClick={() => navigate(`/orders/${order.id}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {order.order_number}
                      </span>
                    </td>
                    <td className="text-sm text-foreground">{order.event_name || '—'}</td>
                    <td className="text-sm text-muted-foreground">{formatDate(order.event_date)}</td>
                    <td><StatusBadge type="order" status={order.status} size="sm" /></td>
                    <td className="text-right text-sm font-medium">{formatCurrency(order.total_amount)}</td>
                    <td className={`text-right text-sm font-medium ${(order.balance_due ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {(order.balance_due ?? 0) > 0 ? formatCurrency(order.balance_due) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
