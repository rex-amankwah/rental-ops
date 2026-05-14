import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, CheckCircle2, AlertTriangle, Loader2, Package, RotateCcw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { SelectField, TextareaField } from '@/components/common/FormField'
import { formatDate } from '@/lib/constants'
import type { RentalOrder, OrderItem, Customer } from '@/types/database'

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

interface ReturnDraft {
  selectedOrderId: string
  notes: string
  returnItems: ReturnItemForm[]
  step: 'order' | 'items'
}

const DRAFT_KEY = 'rental_ops_return_new_draft'

function loadDraft(): ReturnDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? (JSON.parse(raw) as ReturnDraft) : null
  } catch { return null }
}

function saveDraft(d: ReturnDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewReturnPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const draft = loadDraft()

  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState(draft?.selectedOrderId ?? '')
  const [returnItems, setReturnItems] = useState<ReturnItemForm[]>(draft?.returnItems ?? [])
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [step, setStep] = useState<'order' | 'items'>(draft?.step ?? 'order')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Autosave draft on every change — survives remounts and auth refreshes
  useEffect(() => {
    saveDraft({ selectedOrderId, notes, returnItems, step })
  }, [selectedOrderId, notes, returnItems, step])

  // Load eligible orders
  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('rental_orders')
      .select(`id, order_number, event_name, event_date, status, customer_id, customer:customers(first_name,last_name)`)
      .eq('company_id', profile.company_id)
      .in('status', [
        'confirmed', 'inventory_reserved', 'scheduled_for_dispatch',
        'out_for_delivery', 'setup_in_progress', 'event_active',
        'pickup_scheduled', 'partially_returned', 'returned', 'inspection',
      ])
      .order('event_date')
      .limit(50)
      .then(({ data }) => setOrders((data as RentalOrder[] | null) ?? []))
  }, [profile?.company_id])

  // Fetch order items when order selected — skip if draft already has items for this order
  useEffect(() => {
    if (!selectedOrderId) return
    if (returnItems.length > 0 && draft?.selectedOrderId === selectedOrderId) return
    supabase.from('order_items').select('*')
      .eq('order_id', selectedOrderId)
      .not('reservation_status', 'eq', 'returned')
      .then(({ data }) => {
        const items = (data ?? []) as OrderItem[]
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
  }, [selectedOrderId]) // eslint-disable-line react-hooks/exhaustive-deps

  function updateItem(idx: number, field: keyof ReturnItemForm, value: string | number) {
    setReturnItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  async function save() {
    if (!profile?.company_id || !selectedOrderId) return
    setSaving(true)
    setError(null)
    try {
      const { data: ret, error: rErr } = await supabase.from('returns').insert({
        company_id: profile.company_id,
        order_id: selectedOrderId,
        status: 'in_progress',
        return_date: new Date().toISOString().split('T')[0],
        notes: notes || null,
        received_by: profile.id,
      }).select().single()
      if (rErr) throw rErr

      const { error: riErr } = await supabase.from('return_items').insert(
        returnItems.map(ri => ({
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
      )
      if (riErr) throw riErr

      const damaged = returnItems.filter(ri => ri.quantity_damaged > 0)
      if (damaged.length > 0) {
        const order = orders.find(o => o.id === selectedOrderId)
        await supabase.from('damage_reports').insert(
          damaged.map(ri => ({
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

      await Promise.all(returnItems.map(ri =>
        supabase.from('order_items').update({
          reservation_status: 'returned',
          returned_quantity: ri.quantity_returned,
          damaged_quantity: ri.quantity_damaged,
          missing_quantity: ri.quantity_missing,
        }).eq('id', ri.order_item_id)
      ))

      const allReturned = returnItems.every(
        ri => ri.quantity_returned + ri.quantity_damaged + ri.quantity_missing >= ri.quantity_expected
      )
      await supabase.from('rental_orders').update({
        status: allReturned ? 'returned' : 'partially_returned',
      }).eq('id', selectedOrderId)

      await supabase.from('returns').update({ status: 'completed' }).eq('id', ret.id)

      clearDraft()
      navigate('/returns')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to record return')
    } finally {
      setSaving(false)
    }
  }

  function cancel() {
    clearDraft()
    navigate('/returns')
  }

  return (
    <PageShell>
      <PageHeader
        title="Record Return"
        subtitle={step === 'order' ? 'Step 1 of 2 — Select order' : 'Step 2 of 2 — Item condition'}
        actions={
          <button onClick={cancel} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </button>
        }
      />

      {error && (
        <div className="alert alert-error mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="max-w-2xl space-y-6 animate-fade-in">

        {/* ── Step 1: Order selection ─────────────────────────────────── */}
        {step === 'order' && (
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">Select Order</span>
            </div>

            <SelectField
              label="Order" required
              value={selectedOrderId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                setSelectedOrderId(e.target.value)
                setReturnItems([])
                setError(null)
              }}
            >
              <option value="">Choose an order…</option>
              {orders.map(o => {
                const c = (o as unknown as { customer: Customer | null }).customer
                return (
                  <option key={o.id} value={o.id}>
                    {o.order_number}
                    {c ? ` — ${c.first_name} ${c.last_name}` : ''}
                    {o.event_date ? ` · ${formatDate(o.event_date)}` : ''}
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

            <div className="flex justify-end pt-2">
              <button
                className="btn-primary"
                disabled={!selectedOrderId}
                onClick={() => {
                  if (!selectedOrderId) { setError('Select an order first'); return }
                  setError(null)
                  setStep('items')
                }}
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: Item condition ──────────────────────────────────── */}
        {step === 'items' && (
          <>
            <button
              onClick={() => setStep('order')}
              className="btn-ghost text-sm -ml-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to order selection
            </button>

            {returnItems.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <Package className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No unreturned items found on this order</p>
              </div>
            ) : (
              <div className="space-y-4">
                {returnItems.map((ri, idx) => (
                  <div key={ri.order_item_id} className="bg-card border border-border rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{ri.item_name}</p>
                        <p className="text-xs text-muted-foreground">Expected qty: {ri.quantity_expected}</p>
                      </div>
                      <div className="flex gap-1">
                        {ri.quantity_damaged > 0 && (
                          <span className="badge bg-red-100 text-red-700 text-[10px]">Damaged</span>
                        )}
                        {ri.quantity_missing > 0 && (
                          <span className="badge bg-amber-100 text-amber-700 text-[10px]">Missing</span>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {(['quantity_returned', 'quantity_damaged', 'quantity_missing'] as const).map(field => (
                        <div key={field} className="space-y-1">
                          <label className={`text-xs font-medium ${
                            field === 'quantity_damaged' ? 'text-red-600' :
                            field === 'quantity_missing' ? 'text-amber-600' :
                            'text-muted-foreground'
                          }`}>
                            {field === 'quantity_returned' ? 'Returned' :
                             field === 'quantity_damaged' ? 'Damaged' : 'Missing'}
                          </label>
                          <input
                            type="number" min="0" max={ri.quantity_expected}
                            value={ri[field] as number}
                            onChange={(e: ChangeEvent<HTMLInputElement>) =>
                              updateItem(idx, field, parseInt(e.target.value) || 0)
                            }
                            className={`form-input text-sm px-2 py-1 h-8 ${
                              field === 'quantity_damaged' ? 'border-red-200 focus:ring-red-400' :
                              field === 'quantity_missing' ? 'border-amber-200 focus:ring-amber-400' : ''
                            }`}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Condition</label>
                        <select
                          value={ri.condition}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            updateItem(idx, 'condition', e.target.value)
                          }
                          className="form-select text-sm py-1 h-8"
                        >
                          {['excellent', 'good', 'fair', 'poor', 'damaged'].map(c => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Notes</label>
                        <input
                          type="text" placeholder="Optional…"
                          value={ri.notes}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateItem(idx, 'notes', e.target.value)
                          }
                          className="form-input text-sm px-2 py-1 h-8"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={cancel} className="btn-secondary" disabled={saving}>
                Cancel
              </button>
              <button onClick={save} className="btn-primary" disabled={saving || returnItems.length === 0}>
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <CheckCircle2 className="w-4 h-4" />}
                Record Return
              </button>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
