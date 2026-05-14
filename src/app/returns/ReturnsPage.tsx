import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { PageShell, PageHeader, TableCard } from '@/components/common/PageShell'
import { formatDate } from '@/lib/constants'
import { getReturnStatusClass, RETURN_STATUS_COLORS } from '@/lib/statusColors'
import type { RentalOrder, Customer } from '@/types/database'

type ReturnWithOrder = {
  id: string
  order_id: string
  status: string
  return_date: string | null
  notes: string | null
  created_at: string
  order: (RentalOrder & { customer: Customer | null }) | null
}

export default function ReturnsPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  const [returns, setReturns] = useState<ReturnWithOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('returns')
        .select(`*, order:rental_orders(*, customer:customers(first_name,last_name))`)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(50)
      setReturns((data ?? []) as unknown as ReturnWithOrder[])
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id])

  useEffect(() => { load() }, [load])

  return (
    <PageShell>
      <PageHeader
        title="Returns"
        subtitle={`${returns.length} return record${returns.length !== 1 ? 's' : ''}`}
        actions={canEdit(appRole) ? (
          <button onClick={() => navigate('/returns/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            Record Return
          </button>
        ) : undefined}
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : returns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <RotateCcw className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No returns yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Record returns when rental items come back from events.
          </p>
          {canEdit(appRole) && (
            <button onClick={() => navigate('/returns/new')} className="btn-primary">
              <Plus className="w-4 h-4" /> Record First Return
            </button>
          )}
        </div>
      ) : (
        <TableCard>
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Return Date</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(ret => {
                const order = ret.order as unknown as (RentalOrder & { customer: Customer | null }) | null
                const customer = order?.customer as unknown as Customer | null
                return (
                  <tr
                    key={ret.id}
                    onClick={() => order && navigate(`/orders/${ret.order_id}`)}
                    className="cursor-pointer"
                  >
                    <td>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {order?.order_number ?? '—'}
                      </span>
                    </td>
                    <td className="text-sm text-foreground">
                      {customer ? `${customer.first_name} ${customer.last_name}` : '—'}
                    </td>
                    <td className="text-sm text-muted-foreground">{formatDate(ret.return_date)}</td>
                    <td>
                      <span className={`badge text-xs ${getReturnStatusClass(ret.status)}`}>
                        {RETURN_STATUS_COLORS[ret.status]?.label ?? ret.status}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground truncate max-w-[200px]">
                      {ret.notes ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableCard>
      )}
    </PageShell>
  )
}
