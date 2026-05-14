import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import type { RentalOrder, OrderItem } from '@/types/database'

interface OrderWithCustomer extends Omit<RentalOrder, 'customer'> {
  customer: { id: string; first_name: string; last_name: string } | null
}

interface DamageDraft {
  order_id: string
  order_item_id: string
  severity: string
  status: string
  description: string
  estimated_cost: string
}

const BLANK: DamageDraft = {
  order_id: '', order_item_id: '', severity: 'minor',
  status: 'open', description: '', estimated_cost: '',
}

const DRAFT_KEY = 'rental_ops_damage_new_draft'

function loadDraft(): DamageDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: DamageDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewDamagePage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<DamageDraft>(loadDraft() ?? BLANK)
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { saveDraft(form) }, [form])

  // Load orders on mount
  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('rental_orders')
      .select('id, order_number, event_name, event_date, status, customer_id, customer:customers(id,first_name,last_name)')
      .eq('company_id', profile.company_id)
      .not('status', 'in', '("cancelled","closed")')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setOrders((data as unknown as OrderWithCustomer[]) ?? []))
  }, [profile?.company_id])

  // Load order items when order selected
  useEffect(() => {
    if (!form.order_id) { setOrderItems([]); return }
    supabase.from('order_items')
      .select('id, item_name_snapshot, catalog_item_id, quantity')
      .eq('order_id', form.order_id)
      .then(({ data }) => setOrderItems((data ?? []) as OrderItem[]))
  }, [form.order_id])

  function set<K extends keyof DamageDraft>(field: K, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  async function save() {
    if (!profile?.company_id) return
    if (!form.description.trim()) { setError('Description is required'); return }
    setSaving(true); setError(null)
    try {
      const selectedOrder = orders.find(o => o.id === form.order_id)
      const selectedItem = orderItems.find(i => i.id === form.order_item_id)
      const { error: e } = await supabase.from('damage_reports').insert({
        company_id:      profile.company_id,
        order_id:        form.order_id || null,
        catalog_item_id: selectedItem?.catalog_item_id ?? null,
        customer_id:     selectedOrder?.customer_id ?? null,
        status:          form.status,
        severity:        form.severity,
        description:     form.description.trim(),
        estimated_cost:  form.estimated_cost ? parseFloat(form.estimated_cost) : null,
        reported_by:     profile.id,
      })
      if (e) throw e
      clearDraft()
      navigate('/damages')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save damage report')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/damages') }

  return (
    <PageShell>
      <PageHeader
        title="New Damage Report"
        subtitle="Record a damage incident against an order or item"
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
          {/* Order */}
          <div className="space-y-1.5">
            <label className="form-label">Order <span className="text-muted-foreground text-xs">(optional)</span></label>
            <select value={form.order_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                set('order_id', e.target.value)
                set('order_item_id', '')
              }}
              className="form-select">
              <option value="">— No specific order —</option>
              {orders.map(o => {
                const c = o.customer
                return (
                  <option key={o.id} value={o.id}>
                    {o.order_number}{c ? ` — ${c.first_name} ${c.last_name}` : ''}{o.event_name ? ` · ${o.event_name}` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {/* Item — only when order selected */}
          {form.order_id && orderItems.length > 0 && (
            <div className="space-y-1.5">
              <label className="form-label">Item <span className="text-muted-foreground text-xs">(optional)</span></label>
              <select value={form.order_item_id}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('order_item_id', e.target.value)}
                className="form-select">
                <option value="">— No specific item —</option>
                {orderItems.map(i => (
                  <option key={i.id} value={i.id}>{i.item_name_snapshot} (qty {i.quantity})</option>
                ))}
              </select>
            </div>
          )}

          {/* Severity + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="form-label">Severity</label>
              <select value={form.severity}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('severity', e.target.value)}
                className="form-select">
                <option value="minor">Minor</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Status</label>
              <select value={form.status}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('status', e.target.value)}
                className="form-select">
                <option value="open">Open</option>
                <option value="in_review">In Review</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Estimated cost */}
          <div className="space-y-1.5">
            <label className="form-label">Estimated Cost <span className="text-muted-foreground text-xs">(optional)</span></label>
            <input type="number" min="0" step="0.01" placeholder="0.00"
              value={form.estimated_cost}
              onChange={(e: ChangeEvent<HTMLInputElement>) => set('estimated_cost', e.target.value)}
              className="form-input" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="form-label">Description <span className="text-red-500">*</span></label>
            <textarea rows={3} placeholder="Describe the damage in detail…"
              value={form.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value)}
              className="form-input h-auto resize-none" />
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Report
          </button>
        </div>
      </div>
    </PageShell>
  )
}
