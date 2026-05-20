import { useEffect, useState, ChangeEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { TimeSelect } from '@/components/common/TimeSelect'
import type { RentalOrder } from '@/types/database'

const EVENT_TYPES = ['wedding', 'birthday', 'corporate', 'graduation', 'quinceañera', 'anniversary', 'festival', 'religious', 'other']
const SOURCE_OPTIONS = ['referral', 'website', 'social_media', 'repeat', 'walk_in', 'other']
const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'] as const

interface OrderForm {
  event_name: string
  event_type: string
  event_date: string
  event_end_date: string
  event_start_time: string
  event_end_time: string
  guest_count: string
  venue_name: string
  venue_address: string
  venue_city: string
  venue_state: string
  venue_zip: string
  venue_notes: string
  delivery_date: string
  delivery_time: string
  pickup_date: string
  pickup_time: string
  source: string
  priority: string
  internal_notes: string
  customer_notes: string
}

function toForm(o: RentalOrder): OrderForm {
  return {
    event_name:       o.event_name ?? '',
    event_type:       o.event_type ?? '',
    event_date:       o.event_date ?? '',
    event_end_date:   o.event_end_date ?? '',
    event_start_time: o.event_start_time ?? '',
    event_end_time:   o.event_end_time ?? '',
    guest_count:      o.guest_count != null ? String(o.guest_count) : '',
    venue_name:       o.venue_name ?? '',
    venue_address:    o.venue_address ?? '',
    venue_city:       o.venue_city ?? '',
    venue_state:      o.venue_state ?? '',
    venue_zip:        o.venue_zip ?? '',
    venue_notes:      o.venue_notes ?? '',
    delivery_date:    o.delivery_date ?? '',
    delivery_time:    o.delivery_time ?? '',
    pickup_date:      o.pickup_date ?? '',
    pickup_time:      o.pickup_time ?? '',
    source:           o.source ?? '',
    priority:         o.priority ?? 'normal',
    internal_notes:   o.internal_notes ?? '',
    customer_notes:   o.customer_notes ?? '',
  }
}

export default function EditOrderPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [form, setForm] = useState<OrderForm | null>(null)
  const [orderNumber, setOrderNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchOrder = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    const { data, error: e } = await supabase
      .from('rental_orders')
      .select('*')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single()
    if (e || !data) {
      setError('Order not found')
    } else {
      const order = data as RentalOrder
      setOrderNumber(order.order_number)
      setForm(toForm(order))
    }
    setLoading(false)
  }, [id, profile?.company_id])

  useEffect(() => { fetchOrder() }, [fetchOrder])

  function patch(field: keyof OrderForm, value: string) {
    setForm(p => p ? { ...p, [field]: value } : p)
    if (error) setError(null)
  }

  async function save() {
    if (!form || !id || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase
        .from('rental_orders')
        .update({
          event_name:       form.event_name.trim() || null,
          event_type:       form.event_type || null,
          event_date:       form.event_date || null,
          event_end_date:   form.event_end_date || null,
          event_start_time: form.event_start_time || null,
          event_end_time:   form.event_end_time || null,
          guest_count:      form.guest_count ? parseInt(form.guest_count) : null,
          venue_name:       form.venue_name.trim() || null,
          venue_address:    form.venue_address.trim() || null,
          venue_city:       form.venue_city.trim() || null,
          venue_state:      form.venue_state.toUpperCase() || null,
          venue_zip:        form.venue_zip.trim() || null,
          venue_notes:      form.venue_notes.trim() || null,
          delivery_date:    form.delivery_date || null,
          delivery_time:    form.delivery_time || null,
          pickup_date:      form.pickup_date || null,
          pickup_time:      form.pickup_time || null,
          source:           form.source || null,
          priority:         form.priority,
          internal_notes:   form.internal_notes.trim() || null,
          customer_notes:   form.customer_notes.trim() || null,
          updated_at:       new Date().toISOString(),
        })
        .eq('id', id)
        .eq('company_id', profile.company_id)
      if (e) throw e
      navigate(`/orders/${id}`)
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save changes')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!form) {
    return (
      <div className="empty-state">
        <p className="text-sm text-muted-foreground">{error ?? 'Order not found'}</p>
        <button onClick={() => navigate('/orders')} className="btn-secondary mt-4">Back to Orders</button>
      </div>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Edit Order"
        subtitle={orderNumber}
        actions={
          <button onClick={() => navigate(`/orders/${id}`)} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Cancel
          </button>
        }
      />

      <div className="max-w-2xl space-y-5 animate-fade-in">
        {error && (
          <div className="alert alert-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        {/* Event Details */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Event Details</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Event Name</label>
              <input type="text" value={form.event_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('event_name', e.target.value)}
                placeholder="Smith Wedding" className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Event Type</label>
              <select value={form.event_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('event_type', e.target.value)}
                className="form-select">
                <option value="">— Select —</option>
                {EVENT_TYPES.map(t => (
                  <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Guest Count</label>
              <input type="number" min="0" value={form.guest_count}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('guest_count', e.target.value)}
                placeholder="150" className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Event Date</label>
              <input type="date" value={form.event_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('event_date', e.target.value)}
                className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Event End Date</label>
              <input type="date" value={form.event_end_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('event_end_date', e.target.value)}
                className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Start Time</label>
              <TimeSelect
                value={form.event_start_time}
                onChange={(v) => patch('event_start_time', v)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">End Time</label>
              <TimeSelect
                value={form.event_end_time}
                onChange={(v) => patch('event_end_time', v)}
              />
            </div>
          </div>
        </div>

        {/* Venue */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Venue</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Venue Name</label>
              <input type="text" value={form.venue_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('venue_name', e.target.value)}
                placeholder="Grand Ballroom" className="form-input" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Address</label>
              <input type="text" value={form.venue_address}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('venue_address', e.target.value)}
                className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">City</label>
              <input type="text" value={form.venue_city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('venue_city', e.target.value)}
                className="form-input" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">State</label>
                <input type="text" value={form.venue_state} maxLength={2}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch('venue_state', e.target.value.toUpperCase())}
                  placeholder="TX" className="form-input" />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">ZIP</label>
                <input type="text" value={form.venue_zip}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch('venue_zip', e.target.value)}
                  className="form-input" />
              </div>
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Venue Notes</label>
              <textarea value={form.venue_notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('venue_notes', e.target.value)}
                placeholder="Gate code, parking info, setup restrictions…"
                rows={2} className="form-input resize-y w-full" />
            </div>
          </div>
        </div>

        {/* Delivery & Pickup */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delivery & Pickup</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Delivery Date</label>
              <input type="date" value={form.delivery_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('delivery_date', e.target.value)}
                className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Delivery Time</label>
              <TimeSelect
                value={form.delivery_time}
                onChange={(v) => patch('delivery_time', v)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Pickup Date</label>
              <input type="date" value={form.pickup_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('pickup_date', e.target.value)}
                className="form-input" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Pickup Time</label>
              <TimeSelect
                value={form.pickup_time}
                onChange={(v) => patch('pickup_time', v)}
              />
            </div>
          </div>
        </div>

        {/* Meta */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Order Meta</p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label">Source</label>
              <select value={form.source}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('source', e.target.value)}
                className="form-select">
                <option value="">— Select —</option>
                {SOURCE_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Priority</label>
              <select value={form.priority}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('priority', e.target.value)}
                className="form-select">
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Internal Notes</label>
              <textarea value={form.internal_notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('internal_notes', e.target.value)}
                placeholder="Staff-only notes…"
                rows={2} className="form-input resize-y w-full" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Customer Notes</label>
              <textarea value={form.customer_notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('customer_notes', e.target.value)}
                placeholder="Notes visible to the customer…"
                rows={2} className="form-input resize-y w-full" />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate(`/orders/${id}`)} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </PageShell>
  )
}
