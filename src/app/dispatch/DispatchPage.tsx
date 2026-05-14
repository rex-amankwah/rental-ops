import { useEffect, useState, useCallback, MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, Calendar, MapPin, User, Clock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Modal from '@/components/common/Modal'
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

function dispatchTypeLabel(t: string) {
  if (t === 'both') return 'Delivery + Pickup'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function formatTime(t: string | null | undefined) {
  if (!t) return null
  const [h, m] = t.split(':')
  const hr = parseInt(h, 10)
  return `${hr % 12 || 12}:${m} ${hr < 12 ? 'AM' : 'PM'}`
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

  const showDelivery = dispatch.dispatch_type === 'delivery' || dispatch.dispatch_type === 'both'
  const showPickup   = dispatch.dispatch_type === 'pickup'   || dispatch.dispatch_type === 'both'

  return (
    <div
      onClick={() => onOpen(dispatch)}
      className="bg-card border border-border rounded-lg p-3 space-y-2 cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
    >
      {/* Order number + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-foreground">
          {order?.order_number ?? '—'}
        </span>
        <span className={`badge text-[10px] ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>

      {/* Event name */}
      {order?.event_name && (
        <p className="text-xs font-medium text-foreground truncate">{order.event_name}</p>
      )}

      {/* Dispatch type */}
      <span className="inline-block badge text-[10px] bg-muted text-muted-foreground">
        {dispatchTypeLabel(dispatch.dispatch_type)}
      </span>

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

      {/* Delivery date + time */}
      {showDelivery && dispatch.scheduled_delivery_date && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>
            Del: {formatDate(dispatch.scheduled_delivery_date)}
            {dispatch.scheduled_delivery_time && (
              <> · <Clock className="inline w-2.5 h-2.5 mx-0.5" />{formatTime(dispatch.scheduled_delivery_time)}</>
            )}
          </span>
        </div>
      )}

      {/* Pickup date + time */}
      {showPickup && dispatch.scheduled_pickup_date && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span>
            Pickup: {formatDate(dispatch.scheduled_pickup_date)}
            {dispatch.scheduled_pickup_time && (
              <> · <Clock className="inline w-2.5 h-2.5 mx-0.5" />{formatTime(dispatch.scheduled_pickup_time)}</>
            )}
          </span>
        </div>
      )}

      {/* Route notes */}
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

// ─── Main page ───────────────────────────────────────────────────────────────

export default function DispatchPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [dispatches, setDispatches] = useState<DispatchWithOrder[]>([])
  const [loading, setLoading] = useState(true)
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
        <button onClick={() => navigate('/dispatch/new')} className="btn-primary">
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
