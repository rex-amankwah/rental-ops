import { useEffect, useState, useCallback, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Plus, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard } from '@/components/common/PageShell'
import Modal from '@/components/common/Modal'
import { formatDate } from '@/lib/constants'
import type { RentalOrder, OrderItem } from '@/types/database'

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

// ─── New Damage Report Modal ──────────────────────────────────────────────────

interface OrderWithCustomer extends Omit<RentalOrder, 'customer'> {
  customer: { id: string; first_name: string; last_name: string } | null
}

function NewDamageModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void
}) {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [form, setForm] = useState({
    order_id: '',
    order_item_id: '',
    severity: 'minor',
    status: 'open',
    description: '',
    estimated_cost: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load eligible orders when modal opens
  useEffect(() => {
    if (!open || !profile?.company_id) return
    supabase
      .from('rental_orders')
      .select('id, order_number, event_name, event_date, status, customer_id, customer:customers(id,first_name,last_name)')
      .eq('company_id', profile.company_id)
      .not('status', 'in', '("cancelled","closed")')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => setOrders((data as unknown as OrderWithCustomer[]) ?? []))
  }, [open, profile?.company_id])

  // Load order items when an order is selected
  useEffect(() => {
    if (!form.order_id) { setOrderItems([]); return }
    supabase
      .from('order_items')
      .select('id, item_name_snapshot, catalog_item_id, quantity')
      .eq('order_id', form.order_id)
      .then(({ data }) => setOrderItems((data ?? []) as OrderItem[]))
  }, [form.order_id])

  function set<K extends keyof typeof form>(field: K, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (error) setError(null)
  }

  async function save() {
    if (!profile?.company_id) return
    if (!form.description.trim()) { setError('Description is required'); return }
    setSaving(true)
    setError(null)
    try {
      const selectedOrder = orders.find(o => o.id === form.order_id)
      const selectedItem = orderItems.find(i => i.id === form.order_item_id)

      const { error: e } = await supabase.from('damage_reports').insert({
        company_id:     profile.company_id,
        order_id:       form.order_id || null,
        catalog_item_id: selectedItem?.catalog_item_id ?? null,
        customer_id:    selectedOrder?.customer_id ?? null,
        status:         form.status,
        severity:       form.severity,
        description:    form.description.trim(),
        estimated_cost: form.estimated_cost ? parseFloat(form.estimated_cost) : null,
        reported_by:    profile.id,
      })
      if (e) throw e
      onSuccess()
      onClose()
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save damage report')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Damage Report"
      subtitle="Record a damage incident against an order or item"
      size="lg"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Save Report
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Order */}
        <div className="space-y-1.5">
          <label className="form-label">Order <span className="text-muted-foreground text-xs">(optional)</span></label>
          <select
            value={form.order_id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => { set('order_id', e.target.value); set('order_item_id', '') }}
            className="form-select"
          >
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

        {/* Item (only shown when order selected) */}
        {form.order_id && orderItems.length > 0 && (
          <div className="space-y-1.5">
            <label className="form-label">Item <span className="text-muted-foreground text-xs">(optional)</span></label>
            <select
              value={form.order_item_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('order_item_id', e.target.value)}
              className="form-select"
            >
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
            <select
              value={form.severity}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('severity', e.target.value)}
              className="form-select"
            >
              <option value="minor">Minor</option>
              <option value="moderate">Moderate</option>
              <option value="severe">Severe</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Status</label>
            <select
              value={form.status}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => set('status', e.target.value)}
              className="form-select"
            >
              <option value="open">Open</option>
              <option value="in_review">In Review</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Estimated cost */}
        <div className="space-y-1.5">
          <label className="form-label">Estimated Repair / Replacement Cost <span className="text-muted-foreground text-xs">(optional)</span></label>
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={form.estimated_cost}
            onChange={(e: ChangeEvent<HTMLInputElement>) => set('estimated_cost', e.target.value)}
            className="form-input"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="form-label">Description <span className="text-red-500">*</span></label>
          <textarea
            rows={3}
            placeholder="Describe the damage in detail…"
            value={form.description}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value)}
            className="form-input h-auto resize-none"
          />
        </div>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DamagesPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [reports, setReports] = useState<DamageReport[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newModal, setNewModal] = useState(false)

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
        actions={
          <button onClick={() => setNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Damage Report
          </button>
        }
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
          <button onClick={() => setNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Damage Report
          </button>
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

      <NewDamageModal open={newModal} onClose={() => setNewModal(false)} onSuccess={load} />
    </PageShell>
  )
}
