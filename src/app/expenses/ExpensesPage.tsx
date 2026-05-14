import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Receipt, AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { canEdit } from '@/lib/roles'
import { PageShell, PageHeader, TableCard } from '@/components/common/PageShell'
import { EXPENSE_CATEGORIES, formatCurrency, formatDate } from '@/lib/constants'

interface Expense {
  id: string
  company_id: string
  order_id: string | null
  category: string
  description: string
  amount: number
  expense_date: string
  notes: string | null
  created_at: string
  order: { order_number: string } | null
}

const CATEGORY_STYLE: Record<string, string> = {
  labor:     'bg-blue-100 text-blue-700',
  fuel:      'bg-amber-100 text-amber-700',
  repair:    'bg-orange-100 text-orange-700',
  supplies:  'bg-teal-100 text-teal-700',
  transport: 'bg-violet-100 text-violet-700',
  marketing: 'bg-pink-100 text-pink-700',
  other:     'bg-muted text-muted-foreground',
}

export default function ExpensesPage() {
  const { profile, appRole } = useAuth()
  const navigate = useNavigate()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState('')

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true); setFetchError(null)
    try {
      let q = supabase.from('expenses')
        .select('*, order:rental_orders(order_number)')
        .eq('company_id', profile.company_id)
        .order('expense_date', { ascending: false })
        .limit(200)
      if (categoryFilter) q = q.eq('category', categoryFilter)
      const { data, error } = await q
      if (error) throw error
      setExpenses((data ?? []) as unknown as Expense[])
    } catch (err: unknown) {
      setFetchError((err as { message?: string }).message ?? String(err))
    } finally { setLoading(false) }
  }, [profile?.company_id, categoryFilter])

  useEffect(() => { load() }, [load])

  const total = expenses.reduce((s, e) => s + e.amount, 0)

  const catLabel = (value: string) =>
    EXPENSE_CATEGORIES.find(c => c.value === value)?.label ?? value

  return (
    <PageShell>
      <PageHeader
        title="Expenses"
        subtitle={loading ? '—' : `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · ${formatCurrency(total)} total`}
        actions={canEdit(appRole) ? (
          <button onClick={() => navigate('/expenses/new')} className="btn-primary">
            <Plus className="w-4 h-4" /> New Expense
          </button>
        ) : undefined}
      />

      {fetchError && (
        <div className="alert alert-error">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{fetchError}</span>
        </div>
      )}

      {/* Category filter pills */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
            !categoryFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}>
          All
        </button>
        {EXPENSE_CATEGORIES.map(c => (
          <button key={c.value}
            onClick={() => setCategoryFilter(c.value === categoryFilter ? '' : c.value)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === c.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}>
            {c.icon} {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : expenses.length === 0 && !fetchError ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Receipt className="w-7 h-7 text-muted-foreground" />
          </div>
          <h3 className="text-base font-medium text-foreground mb-1">No expenses yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Track labor, fuel, repairs, and other operational costs here.
          </p>
          {canEdit(appRole) && (
            <button onClick={() => navigate('/expenses/new')} className="btn-primary">
              <Plus className="w-4 h-4" /> Record First Expense
            </button>
          )}
        </div>
      ) : (
        <TableCard>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Description</th>
                <th>Order</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(exp => (
                <tr key={exp.id}>
                  <td className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatDate(exp.expense_date)}
                  </td>
                  <td>
                    <span className={`badge text-xs capitalize ${CATEGORY_STYLE[exp.category] ?? 'bg-muted text-muted-foreground'}`}>
                      {catLabel(exp.category)}
                    </span>
                  </td>
                  <td>
                    <p className="text-sm text-foreground">{exp.description}</p>
                    {exp.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{exp.notes}</p>}
                  </td>
                  <td>
                    {exp.order ? (
                      <button
                        onClick={() => navigate(`/orders/${exp.order_id}`)}
                        className="font-mono text-xs font-semibold text-primary hover:underline">
                        {exp.order.order_number}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right text-sm font-medium text-foreground">
                    {formatCurrency(exp.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
            {expenses.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border">
                  <td colSpan={4} className="text-sm font-semibold text-foreground py-3 px-4">Total</td>
                  <td className="text-right text-sm font-bold text-foreground py-3 px-4">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </TableCard>
      )}
    </PageShell>
  )
}
