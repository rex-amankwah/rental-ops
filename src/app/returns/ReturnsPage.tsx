import { useEffect, useState, useCallback, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCcw, Plus, Loader2, AlertTriangle, CheckCircle2, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader, TableCard } from '@/components/common/PageShell'
import Modal from '@/components/common/Modal'
import { SelectField, TextareaField } from '@/components/common/FormField'
import { formatDate } from '@/lib/constants'
import type { RentalOrder, OrderItem, Customer } from '@/types/database'

type ReturnWithOrder = {
  id: string
  order_id: string
  status: string
  return_date: string | null
  notes: string | null
  created_at: string
  order: (RentalOrder & { customer: Customer | null }) | null
}

type ReturnItemForm = {
  order_item_id: string
  catalog_item_id: string
  item_name: string
  quantity_expected: number
  quantity_returned: number
  quantity_damaged: number
  quantity_missing: number
  condition: string
  notes: string
}

// ─── New Return Modal ────────────────────────────────────────────────────────

function NewReturnModal({ open, onClose, onSuccess }: {
  open: boolean; onClose: () => void; onSuccess: () => void
}) {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [returnItems, setReturnItems] = useState<ReturnItemForm[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'order' | 'items'>('order')

  useEffect(() => {
    if (!open || !profile?.company_id) return
    supabase.from('rental_orders')
      .select(`id, order_number, event_name, event_date, status, customer:customers(first_name,last_name)`)
      .eq('company_id', profile.company_id)
      .in('status', [
        'confirmed','inventory_reserved','scheduled_for_dispatch',
        'out_for_delivery','setup_in_progress','event_active',
        'pickup_scheduled','partially_returned','returned','inspection',
      ])
      .order('event_date')
      .limit(50)
      .then(({ data }) => setOrders((data as RentalOrder[] | null) ?? []))
  }, [open, profile?.company_id])

  useEffect(() => {
    if (!selectedOrderId) { setOrderItems([]); return }
    supabase.from('order_items').select('*')
      .eq('order_id', selectedOrderId)
      .not('reservation_status', 'eq', 'returned')
      .then(({ data }) => {
        const items = (data ?? []) as OrderItem[]
        setOrderItems(items)
        setReturnItems(items.map(i => ({
          order_item_id: i.id,
          catalog_item_id: i.catalog_item_id ?? '',
          item_name: i.item_name_snapshot,
          quantity_expected: i.quantity,
          quantity_returned: i.quantity,
          quantity_damaged: 0,
          quantity_missing: 0,
          condition: 'good',
          notes: '',
        })))
      })
  }, [selectedOrderId])

  function updateReturnItem(idx: number, field: keyof ReturnItemForm, value: string | number) {
    setReturnItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function save() {
    if (!profile?.company_id || !selectedOrderId) return
    setSaving(true); setError(null)
    try {
      // Create return record
      const { data: ret, error: rErr } = await supabase.from('returns').insert({
        company_id: profile.company_id,
        order_id: selectedOrderId,
        status: 'in_progress',
        return_date: new Date().toISOString().split('T')[0],
        notes: notes || null,
        received_by: profile.id,
      }).select().single()
      if (rErr) throw rErr

      // Insert return items
      const itemInserts = returnItems.map(ri => ({
        company_id: profile.company_id,
        return_id: ret.id,
        order_item_id: ri.order_item_id,
        catalog_item_id: ri.catalog_item_id || null,
        quantity_expected: ri.quantity_expected,
        quantity_returned: ri.quantity_returned,
        quantity_damaged: ri.quantity_damaged,
        quantity_missing: ri.quantity_missing,
        condition: ri.condition,
        notes: ri.notes || null,
      }))
      const { error: riErr } = await supabase.from('return_items').insert(itemInserts)
      if (riErr) throw riErr

      // Create damage reports for damaged items
      const damagedItems = returnItems.filter(ri => ri.quantity_damaged > 0)
      if (damagedItems.length > 0) {
        const order = orders.find(o => o.id === selectedOrderId)
        await supabase.from('damage_reports').insert(
          damagedItems.map(ri => ({
            company_id: profile.company_id,
            order_id: selectedOrderId,
            catalog_item_id: ri.catalog_item_id || null,
            customer_id: (order as unknown as { customer_id: string | null })?.customer_id ?? null,
            status: 'open',
            severity: 'minor',
            description: `${ri.quantity_damaged} unit(s) of "${ri.item_name}" returned damaged`,
            reported_by: profile.id,
          }))
        )
      }

      // Update order_items status
      await Promise.all(returnItems.map(ri => {
        const allReturned = ri.quantity_returned + ri.quantity_damaged + ri.quantity_missing >= ri.quantity_expected
        return supabase.from('order_items')
          .update({
            reservation_status: allReturned ? 'returned' : 'returned',
            returned_quantity: ri.quantity_returned,
            damaged_quantity: ri.quantity_damaged,
            missing_quantity: ri.quantity_missing,
          })
          .eq('id', ri.order_item_id)
      }))

      // Update order status
      const allReturned = returnItems.every(ri =>
        ri.quantity_returned + ri.quantity_damaged + ri.quantity_missing >= ri.quantity_expected
      )
      await supabase.from('rental_orders').update({
        status: allReturned ? 'returned' : 'partially_returned'
      }).eq('id', selectedOrderId)

      // Update return to completed
      await supabase.from('returns').update({ status: 'completed' }).eq('id', ret.id)

      onSuccess(); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to record return')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Record Return" size="2xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          {step === 'order' ? (
            <button
              onClick={() => { if (!selectedOrderId) { setError('Select an order'); return }; setError(null); setStep('items') }}
              className="btn-primary"
              disabled={!selectedOrderId}
            >
              Continue →
            </button>
          ) : (
            <button onClick={save} className="btn-primary" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Record Return
            </button>
          )}
        </>
      }
    >
      {error && <div className="alert alert-error mb-4"><AlertTriangle className="w-4 h-4" /><span>{error}</span></div>}

      {step === 'order' && (
        <div className="space-y-4">
          <SelectField
            label="Select Order" required
            value={selectedOrderId}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedOrderId(e.target.value)}
          >
            <option value="">Choose an order…</option>
            {orders.map(o => {
              const c = (o as unknown as { customer: { first_name: string; last_name: string } | null }).customer
              return (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {c ? `${c.first_name} ${c.last_name}` : 'No customer'} · {formatDate(o.event_date)}
                </option>
              )
            })}
          </SelectField>
          <TextareaField
            label="General Notes"
            placeholder="Overall return condition notes…"
            value={notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          />
        </div>
      )}

      {step === 'items' && (
        <div className="space-y-4">
          {orderItems.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No items found on this order</p>
            </div>
          ) : (
            <div className="space-y-3">
              {returnItems.map((ri, idx) => (
                <div key={ri.order_item_id} className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-foreground">{ri.item_name}</p>
                      <p className="text-xs text-muted-foreground">Expected: {ri.quantity_expected}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {ri.quantity_damaged > 0 && <span className="badge bg-red-100 text-red-700 text-[10px]">Damaged</span>}
                      {ri.quantity_missing > 0 && <span className="badge bg-amber-100 text-amber-700 text-[10px]">Missing</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Returned</label>
                      <input type="number" min="0" max={ri.quantity_expected}
                        value={ri.quantity_returned}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateReturnItem(idx, 'quantity_returned', parseInt(e.target.value) || 0)}
                        className="form-input text-sm px-2 py-1 h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-red-600">Damaged</label>
                      <input type="number" min="0" max={ri.quantity_expected}
                        value={ri.quantity_damaged}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateReturnItem(idx, 'quantity_damaged', parseInt(e.target.value) || 0)}
                        className="form-input text-sm px-2 py-1 h-8 border-red-200 focus:ring-red-400"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-amber-600">Missing</label>
                      <input type="number" min="0" max={ri.quantity_expected}
                        value={ri.quantity_missing}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateReturnItem(idx, 'quantity_missing', parseInt(e.target.value) || 0)}
                        className="form-input text-sm px-2 py-1 h-8 border-amber-200 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Condition</label>
                      <select
                        value={ri.condition}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => updateReturnItem(idx, 'condition', e.target.value)}
                        className="form-select text-sm py-1 h-8"
                      >
                        {['excellent','good','fair','poor','damaged'].map(c => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Notes</label>
                      <input type="text" placeholder="Optional…"
                        value={ri.notes}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => updateReturnItem(idx, 'notes', e.target.value)}
                        className="form-input text-sm px-2 py-1 h-8"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ReturnsPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [returns, setReturns] = useState<ReturnWithOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [newModal, setNewModal] = useState(false)

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
        actions={
          <button onClick={() => setNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Record Return
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : returns.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><RotateCcw className="w-7 h-7 text-muted-foreground" /></div>
          <h3 className="text-base font-medium text-foreground mb-1">No returns yet</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-xs">
            Record returns when rental items come back from events.
          </p>
          <button onClick={() => setNewModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" /> Record First Return
          </button>
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
                      <span className={`badge text-xs ${
                        ret.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        ret.status === 'disputed' ? 'bg-red-100 text-red-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {ret.status}
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

      <NewReturnModal open={newModal} onClose={() => setNewModal(false)} onSuccess={load} />
    </PageShell>
  )
}
