import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { EXPENSE_CATEGORIES, formatDate } from '@/lib/constants'
import type { RentalOrder } from '@/types/database'

interface ExpenseDraft {
  expense_date: string
  category: string
  description: string
  amount: string
  order_id: string
  notes: string
}

const BLANK: ExpenseDraft = {
  expense_date: new Date().toISOString().split('T')[0],
  category: 'supplies',
  description: '',
  amount: '',
  order_id: '',
  notes: '',
}

const DRAFT_KEY = 'rental_ops_expense_new_draft'

function loadDraft(): ExpenseDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: ExpenseDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewExpensePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<ExpenseDraft>(loadDraft() ?? BLANK)
  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ExpenseDraft, string>>>({})

  useEffect(() => { saveDraft(form) }, [form])

  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('rental_orders')
      .select('id, order_number, event_name, event_date')
      .eq('company_id', profile.company_id)
      .not('status', 'in', '("cancelled","closed")')
      .order('event_date', { ascending: false })
      .limit(100)
      .then(({ data }) => setOrders((data ?? []) as RentalOrder[]))
  }, [profile?.company_id])

  function set(field: keyof ExpenseDraft, value: string) {
    setForm(p => ({ ...p, [field]: value }))
    if (fieldErrors[field]) setFieldErrors(p => { const n = { ...p }; delete n[field]; return n })
    if (error) setError(null)
  }

  function validate(): boolean {
    const e: Partial<Record<keyof ExpenseDraft, string>> = {}
    if (!form.description.trim()) e.description = 'Description is required'
    const amt = parseFloat(form.amount)
    if (!form.amount || isNaN(amt) || amt <= 0) e.amount = 'Enter a valid amount greater than 0'
    if (!form.expense_date) e.expense_date = 'Date is required'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate() || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('expenses').insert({
        company_id:   profile.company_id,
        category:     form.category,
        description:  form.description.trim(),
        amount:       parseFloat(form.amount),
        expense_date: form.expense_date,
        order_id:     form.order_id || null,
        notes:        form.notes.trim() || null,
        paid_by:      profile.id,
      })
      if (e) throw e
      clearDraft()
      navigate('/expenses')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save expense')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/expenses') }

  return (
    <PageShell>
      <PageHeader
        title="New Expense"
        subtitle="Record an operational expense"
        actions={
          <button onClick={cancel} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        }
      />

      <div className="max-w-lg space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          {/* Date + Category */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.expense_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('expense_date', e.target.value)}
                className={`form-input ${fieldErrors.expense_date ? 'border-red-400' : ''}`} />
              {fieldErrors.expense_date && <p className="text-xs text-red-600">{fieldErrors.expense_date}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Category <span className="text-red-500">*</span></label>
              <select value={form.category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('category', e.target.value)}
                className="form-select">
                {EXPENSE_CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description / Vendor */}
          <div className="space-y-1.5">
            <label className="form-label">Description / Vendor <span className="text-red-500">*</span></label>
            <input type="text" autoFocus value={form.description}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('description', e.target.value)}
              placeholder="e.g. Gas station fill-up, Staff wages — Saturday event"
              className={`form-input ${fieldErrors.description ? 'border-red-400' : ''}`} />
            {fieldErrors.description && <p className="text-xs text-red-600">{fieldErrors.description}</p>}
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <label className="form-label">Amount ($) <span className="text-red-500">*</span></label>
            <input type="number" min="0.01" step="0.01" placeholder="0.00"
              value={form.amount}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('amount', e.target.value)}
              className={`form-input ${fieldErrors.amount ? 'border-red-400' : ''}`} />
            {fieldErrors.amount && <p className="text-xs text-red-600">{fieldErrors.amount}</p>}
          </div>

          {/* Related order */}
          <div className="space-y-1.5">
            <label className="form-label">Related Order <span className="text-muted-foreground text-xs">(optional)</span></label>
            <select value={form.order_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('order_id', e.target.value)}
              className="form-select">
              <option value="">— No specific order —</option>
              {orders.map(o => (
                <option key={o.id} value={o.id}>
                  {o.order_number}{o.event_name ? ` · ${o.event_name}` : ''}{o.event_date ? ` (${formatDate(o.event_date)})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="form-label">Notes <span className="text-muted-foreground text-xs">(optional)</span></label>
            <textarea rows={3} placeholder="Any additional details…"
              value={form.notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('notes', e.target.value)}
              className="form-input h-auto resize-none" />
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Expense
          </button>
        </div>
      </div>
    </PageShell>
  )
}
