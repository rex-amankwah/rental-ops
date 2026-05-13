import { useEffect, useState, useCallback, ChangeEvent, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Truck, Plus, Loader2, Calendar, MapPin, User, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Modal from '@/components/common/Modal'
import { InputField, SelectField, TextareaField } from '@/components/common/FormField'
import { formatDate, DISPATCH_STATUS_CONFIG } from '@/lib/constants'
import type { Dispatch, RentalOrder, Customer } from '@/types/database'
import type { DispatchStatus } from '@/types/database'

type DispatchWithOrder = Dispatch & {
  order: (RentalOrder & { customer: Customer | null }) | null
}

const COLUMNS: DispatchStatus[] = [
  'scheduled', 'loading', 'out_for_delivery', 'delivered',
  'setup_done', 'pickup_pending', 'returned'
]

const NEXT_STATUS: Partial<Record<DispatchStatus, DispatchStatus>> = {
  scheduled:        'loading',
  loading:          'out_for_delivery',
  out_for_delivery: 'delivered',
  delivered:        'setup_done',
  setup_done:       'pickup_pending',
  pickup_pending:   'returned',
}

// ─── Dispatch card ───────────────────────────────────────────────────────────

function DispatchCard({
  dispatch, onAdvance, onOpen
}: {
  dispatch: DispatchWithOrder
  onAdvance: (id: string, nextStatus: DispatchStatus) => Promise<void>
  onOpen: (d: DispatchWithOrder) => void
}) {
  const order = dispatch.order as unknown as (RentalOrder & { customer: Customer | null }) | null
  const customer = order?.customer as unknown as Customer | null
  const next = NEXT_STATUS[dispatch.status]
  const [advancing, setAdvancing] = useState(false)
  const cfg = DISPATCH_STATUS_CONFIG[dispatch.status]

  async function advance(e: MouseEvent) {
    e.stopPropagation()
    if (!next) return
    setAdvancing(true)
    await onAdvance(dispatch.id, next)
    setAdvancing(false)
  }

  return (
    <div
      onClick={() => onOpen(dispatch)}
      className="bg-card border border-border rounded-lg p-3 space-y-2 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
    >
      {/* Order number + type */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {order?.order_number ?? '—'}
        </span>
        <span className={`badge text-[10px] ${cfg.bg} ${cfg.color}`}>
          {dispatch.dispatch_type}
        </span>
      </div>

      {/* Customer */}
      {customer && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <User className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{customer.first_name} {customer.last_name}</span>
        </div>
      )}

      {/* Venue */}
      {dispatch.delivery_city && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{dispatch.delivery_city}</span>
        </div>
      )}

      {/* Delivery time */}
      {(dispatch.scheduled_delivery_date || dispatch.scheduled_pickup_date) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>
            {dispatch.dispatch_type === 'pickup'
              ? formatDate(dispatch.scheduled_pickup_date)
              : formatDate(dispatch.scheduled_delivery_date)}
          </span>
        </div>
      )}

      {/* Driver */}
      {dispatch.route_notes && (
        <p className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5 truncate">
          {dispatch.route_notes}
        </p>
      )}

      {/* Advance button */}
      {next && (
        <button
          onClick={advance}
          disabled={advancing}
          className="w-full text-xs btn-secondary py-1 mt-1 justify-center"
        >
          {advancing
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : `→ ${DISPATCH_STATUS_CONFIG[next].label}`}
        </button>
      )}
    </div>
  )
}

// ─── New Dispatch Modal ──────────────────────────────────────────────────────

function NewDispatchModal({
  open, onClose, onSuccess
}: {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}) {
  const { profile } = useAuth()
  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [form, setForm] = useState({
    order_id: '', dispatch_type: 'delivery',
    scheduled_delivery_date: '', scheduled_delivery_time: '',
    scheduled_pickup_date: '', scheduled_pickup_time: '',
    delivery_address: '', delivery_city: '', delivery_state: '', delivery_zip: '',
    contact_name: '', contact_phone: '',
    delivery_notes: '', pickup_notes: '', route_notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !profile?.company_id) return
    supabase.from('rental_orders').select(`
      id, order_number, event_name, event_date, status,
      venue_name, venue_address, venue_city, venue_state, venue_zip,
      customer:customers(first_name, last_name)
    `)
      .eq('company_id', profile.company_id)
      .in('status', ['confirmed','inventory_reserved','scheduled_for_dispatch'])
      .order('event_date')
      .limit(50)
      .then(({ data }) => setOrders((data as RentalOrder[] | null) ?? []))
  }, [open, profile?.company_id])

  // Auto-fill address from selected order
  useEffect(() => {
    if (!form.order_id) return
    const order = orders.find(o => o.id === form.order_id)
    if (order) {
      setForm(p => ({
        ...p,
        delivery_address: order.venue_address ?? '',
        delivery_city: order.venue_city ?? '',
        delivery_state: order.venue_state ?? '',
        delivery_zip: order.venue_zip ?? '',
        scheduled_delivery_date: order.delivery_date ?? order.event_date ?? '',
        scheduled_pickup_date: order.pickup_date ?? '',
      }))
    }
  }, [form.order_id, orders])

  async function save() {
    if (!profile?.company_id) return
    if (!form.order_id) { setError('Please select an order'); return }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('dispatches').insert({
        company_id: profile.company_id,
        order_id: form.order_id,
        dispatch_type: form.dispatch_type,
        status: 'scheduled',
        scheduled_delivery_date: form.scheduled_delivery_date || null,
        scheduled_delivery_time: form.scheduled_delivery_time || null,
        scheduled_pickup_date: form.scheduled_pickup_date || null,
        scheduled_pickup_time: form.scheduled_pickup_time || null,
        delivery_address: form.delivery_address || null,
        delivery_city: form.delivery_city || null,
        delivery_state: form.delivery_state || null,
        delivery_zip: form.delivery_zip || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        delivery_notes: form.delivery_notes || null,
        pickup_notes: form.pickup_notes || null,
        route_notes: form.route_notes || null,
      })
      if (e) throw e

      // Update order status to scheduled_for_dispatch
      await supabase.from('rental_orders').update({ status: 'scheduled_for_dispatch' })
        .eq('id', form.order_id).in('status', ['confirmed','inventory_reserved'])

      onSuccess(); onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create dispatch')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      open={open} onClose={onClose} title="Create Dispatch" size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Create Dispatch
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <div className="alert alert-error"><AlertTriangle className="w-4 h-4" /><span>{error}</span></div>}

        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Order" required fieldClassName="col-span-2"
            value={form.order_id}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => ({ ...p, order_id: e.target.value }))}
          >
            <option value="">Select order…</option>
            {orders.map(o => {
              const c = (o as unknown as { customer: { first_name: string; last_name: string } | null }).customer
              return (
                <option key={o.id} value={o.id}>
                  {o.order_number} — {c ? `${c.first_name} ${c.last_name}` : 'No customer'} · {formatDate(o.event_date)}
                </option>
              )
            })}
          </SelectField>

          <SelectField
            label="Type"
            value={form.dispatch_type}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => setForm(p => ({ ...p, dispatch_type: e.target.value }))}
          >
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
            <option value="both">Delivery + Pickup</option>
          </SelectField>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Schedule</p>
          <div className="grid grid-cols-2 gap-4">
            {(form.dispatch_type === 'delivery' || form.dispatch_type === 'both') && <>
              <InputField label="Delivery Date" type="date" value={form.scheduled_delivery_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, scheduled_delivery_date: e.target.value }))} />
              <InputField label="Delivery Time" type="time" value={form.scheduled_delivery_time}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, scheduled_delivery_time: e.target.value }))} />
            </>}
            {(form.dispatch_type === 'pickup' || form.dispatch_type === 'both') && <>
              <InputField label="Pickup Date" type="date" value={form.scheduled_pickup_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, scheduled_pickup_date: e.target.value }))} />
              <InputField label="Pickup Time" type="time" value={form.scheduled_pickup_time}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, scheduled_pickup_time: e.target.value }))} />
            </>}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Delivery Address</p>
          <div className="grid grid-cols-2 gap-4">
            <InputField label="Address" fieldClassName="col-span-2" value={form.delivery_address}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, delivery_address: e.target.value }))} />
            <InputField label="City" value={form.delivery_city}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, delivery_city: e.target.value }))} />
            <div className="grid grid-cols-2 gap-3">
              <InputField label="State" maxLength={2} value={form.delivery_state}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, delivery_state: e.target.value.toUpperCase() }))} />
              <InputField label="ZIP" value={form.delivery_zip}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, delivery_zip: e.target.value }))} />
            </div>
            <InputField label="Contact Name" value={form.contact_name}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, contact_name: e.target.value }))} />
            <InputField label="Contact Phone" type="tel" value={form.contact_phone}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, contact_phone: e.target.value }))} />
          </div>
        </div>

        <div className="border-t border-border pt-4 space-y-3">
          <TextareaField label="Delivery Notes" value={form.delivery_notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm(p => ({ ...p, delivery_notes: e.target.value }))} />
          <TextareaField label="Route Notes" value={form.route_notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setForm(p => ({ ...p, route_notes: e.target.value }))} />
        </div>
      </div>
    </Modal>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [dispatches, setDispatches] = useState<DispatchWithOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [newModal, setNewModal] = useState(false)
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchWithOrder | null>(null)

  const load = useCallback(async () => {
    if (!profile?.company_id) return
    setLoading(true)
    try {
      const { data } = await supabase
        .from('dispatches')
        .select(`*, order:rental_orders(*, customer:customers(first_name,last_name))`)
        .eq('company_id', profile.company_id)
        .not('status', 'eq', 'cancelled')
        .order('scheduled_delivery_date', { ascending: true })
        .limit(200)
      setDispatches((data ?? []) as unknown as DispatchWithOrder[])
    } finally {
      setLoading(false)
    }
  }, [profile?.company_id])

  useEffect(() => { load() }, [load])

  async function advanceStatus(id: string, nextStatus: DispatchStatus) {
    const updates: Record<string, unknown> = { status: nextStatus, updated_at: new Date().toISOString() }
    if (nextStatus === 'delivered') updates.actual_delivery_at = new Date().toISOString()
    if (nextStatus === 'returned') {
      updates.actual_pickup_at = new Date().toISOString()
      // Also mark the order as returned
      const d = dispatches.find(x => x.id === id)
      if (d?.order_id) {
        await supabase.from('rental_orders').update({ status: 'returned' }).eq('id', d.order_id)
      }
    }
    await supabase.from('dispatches').update(updates).eq('id', id)
    setDispatches(prev => prev.map(d =>
      d.id === id ? { ...d, status: nextStatus } : d
    ))
  }

  const byStatus = (status: DispatchStatus) =>
    dispatches.filter(d => d.status === status)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="page-title">Dispatch Board</h2>
          <p className="page-subtitle">{dispatches.length} active dispatch{dispatches.length !== 1 ? 'es' : ''}</p>
        </div>
        <button onClick={() => setNewModal(true)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New Dispatch
        </button>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(col => {
            const cards = byStatus(col)
            const cfg = DISPATCH_STATUS_CONFIG[col]
            return (
              <div key={col} className="w-64 flex-shrink-0">
                {/* Column header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${cfg.bg.replace('bg-', 'bg-')}`} />
                    <span className="text-xs font-semibold text-foreground">{cfg.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                    {cards.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="space-y-2 min-h-[100px]">
                  {cards.length === 0 ? (
                    <div className="border-2 border-dashed border-border rounded-lg p-4 text-center">
                      <p className="text-xs text-muted-foreground">Empty</p>
                    </div>
                  ) : cards.map(d => (
                    <div key={d.id}>
                      <DispatchCard
                        dispatch={d}
                        onAdvance={advanceStatus}
                        onOpen={(dispatch: DispatchWithOrder) => setSelectedDispatch(dispatch)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* New dispatch modal */}
      <NewDispatchModal
        open={newModal}
        onClose={() => setNewModal(false)}
        onSuccess={load}
      />

      {/* Dispatch detail modal */}
      {selectedDispatch && (
        <Modal
          open={!!selectedDispatch}
          onClose={() => setSelectedDispatch(null)}
          title={`Dispatch — ${(selectedDispatch.order as unknown as { order_number: string } | null)?.order_number ?? '—'}`}
          size="lg"
          footer={
            <div className="flex gap-2 w-full">
              <button
                onClick={() => {
                  const orderId = selectedDispatch.order_id
                  setSelectedDispatch(null)
                  navigate(`/orders/${orderId}`)
                }}
                className="btn-secondary"
              >
                View Order
              </button>
              <div className="flex-1" />
              <button onClick={() => setSelectedDispatch(null)} className="btn-secondary">Close</button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            {[
              ['Type', selectedDispatch.dispatch_type],
              ['Status', DISPATCH_STATUS_CONFIG[selectedDispatch.status].label],
              ['Delivery Date', formatDate(selectedDispatch.scheduled_delivery_date)],
              ['Pickup Date', formatDate(selectedDispatch.scheduled_pickup_date)],
              ['Address', [selectedDispatch.delivery_address, selectedDispatch.delivery_city].filter(Boolean).join(', ') || '—'],
              ['Contact', selectedDispatch.contact_name ?? '—'],
              ['Phone', selectedDispatch.contact_phone ?? '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-muted-foreground w-28 flex-shrink-0">{k}</span>
                <span className="text-foreground">{v}</span>
              </div>
            ))}
            {selectedDispatch.delivery_notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Delivery Notes</p>
                <p className="text-foreground">{selectedDispatch.delivery_notes}</p>
              </div>
            )}
            {selectedDispatch.route_notes && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Route Notes</p>
                <p className="text-foreground">{selectedDispatch.route_notes}</p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
