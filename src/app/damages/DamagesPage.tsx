import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Plus, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { PageShell, PageHeader, TableCard } from '@/components/common/PageShell'
import { formatDate } from '@/lib/constants'

interface DamageReport {
  id: string
  company_id: string
  order_id: string | null
  catalog_item_id: string | null
  customer_id: string | null
  status: string
  severity: string
  description: string | null
  estimated_cost: number | null
  reported_by: string | null
  created_at: string
  order: { order_number: string } | null
  customer: { first_name: string; last_name: string } | null
}

const SEVERITY_STYLE: Record<string, string> = {
  minor:    'bg-amber-100 text-amber-700',
  moderate: 'bg-orange-100 text-orange-700',
  severe:   'bg-red-100 text-red-700',
}

const STATUS_STYLE: Record<string, string> = {
  open:       'bg-red-100 text-red-700',
  in_review:  'bg-amber-100 text-amber-700',
  resolved:   'bg-emerald-100 text-emerald-700',
  closed:     'bg-muted text-muted-foreground',
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DamagesPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  const [reports, setReports] = useState<DamageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    setFetchError(null)
    try {
      const { data, error } = await supabase
        .from('damage_reports')
        .select(`*, order:rental_orders(order_number), customer:customers(first_name,last_name)`)
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      setReports((data ?? []) as unknown as DamageReport[])
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
        title="Damage Reports"
        subtitle={`${reports.length} report${reports.length !== 1 ? 's' : ''}`}
        actions={canEdit(appRole) ? (
          <button onClick={() => navigate('/damages/new')} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Damage Report
          </button>
        ) : undefined}
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
      ) : reports.length === 0 && !fetchError ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <AlertTriangle className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No damage reports</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Damage reports are created automatically when recording returns with damaged items, or manually here.
          </p>
          {canEdit(appRole) && (
            <button onClick={() => navigate('/damages/new')} className="btn-primary">
              <Plus className="w-4 h-4" />
              New Damage Report
            </button>
          )}
        </div>
      ) : (
        <TableCard>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Description</th>
                <th>Est. Cost</th>
                <th>Severity</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(r => (
                <tr
                  key={r.id}
                  onClick={() => r.order_id && navigate(`/orders/${r.order_id}`)}
                  className={r.order_id ? 'cursor-pointer' : ''}
                >
                  <td className="text-sm text-muted-foreground">{formatDate(r.created_at)}</td>
                  <td>
                    <span className="font-mono text-xs font-semibold text-foreground">
                      {r.order?.order_number ?? '—'}
                    </span>
                  </td>
                  <td className="text-sm text-foreground">
                    {r.customer ? `${r.customer.first_name} ${r.customer.last_name}` : '—'}
                  </td>
                  <td className="text-sm text-foreground max-w-xs truncate">{r.description ?? '—'}</td>
                  <td className="text-sm text-foreground">
                    {r.estimated_cost != null ? `$${r.estimated_cost.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <span className={`badge text-xs capitalize ${SEVERITY_STYLE[r.severity] ?? 'bg-muted text-muted-foreground'}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td>
                    <span className={`badge text-xs capitalize ${STATUS_STYLE[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                      {r.status.replace(/_/g, ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableCard>
      )}

    </PageShell>
  )
}
