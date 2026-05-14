import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Truck, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { InputField, SelectField, TextareaField } from '@/components/common/FormField'
import { formatDate } from '@/lib/constants'
import type { RentalOrder } from '@/types/database'

interface DispatchDraft {
  order_id: string
  dispatch_type: string
  scheduled_delivery_date: string
  scheduled_delivery_time: string
  scheduled_pickup_date: string
  scheduled_pickup_time: string
  delivery_address: string
  delivery_city: string
  delivery_state: string
  delivery_zip: string
  contact_name: string
  contact_phone: string
  delivery_notes: string
  pickup_notes: string
  route_notes: string
}

const BLANK: DispatchDraft = {
  order_id: '', dispatch_type: 'delivery',
  scheduled_delivery_date: '', scheduled_delivery_time: '',
  scheduled_pickup_date: '', scheduled_pickup_time: '',
  delivery_address: '', delivery_city: '', delivery_state: '', delivery_zip: '',
  contact_name: '', contact_phone: '',
  delivery_notes: '', pickup_notes: '', route_notes: '',
}

const DRAFT_KEY = 'rental_ops_dispatch_new_draft'

function loadDraft(): DispatchDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: DispatchDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewDispatchPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<DispatchDraft>(loadDraft() ?? BLANK)
  const [orders, setOrders] = useState<RentalOrder[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { saveDraft(form) }, [form])

  // Load eligible orders on mount
  useEffect(() => {
    if (!profile?.company_id) return
    supabase.from('rental_orders')
      .select(`id, order_number, event_name, event_date, status,
        venue_name, venue_address, venue_city, venue_state, venue_zip,
        delivery_date, pickup_date,
        customer:customers(first_name, last_name)`)
      .eq('company_id', profile.company_id)
      .in('status', ['confirmed', 'inventory_reserved', 'scheduled_for_dispatch'])
      .order('event_date')
      .limit(50)
      .then(({ data }) => setOrders((data as RentalOrder[] | null) ?? []))
  }, [profile?.company_id])

  // Auto-fill address from selected order
  useEffect(() => {
    if (!form.order_id) return
    const order = orders.find(o => o.id === form.order_id)
    if (!order) return
    setForm(p => ({
      ...p,
      delivery_address: order.venue_address ?? '',
      delivery_city: order.venue_city ?? '',
      delivery_state: order.venue_state ?? '',
      delivery_zip: order.venue_zip ?? '',
      scheduled_delivery_date: order.delivery_date ?? order.event_date ?? '',
      scheduled_pickup_date: order.pickup_date ?? '',
    }))
  }, [form.order_id, orders]) // eslint-disable-line react-hooks/exhaustive-deps

  function patch(updates: Partial<DispatchDraft>) {
    setForm(p => ({ ...p, ...updates }))
    if (error) setError(null)
  }

  async function save() {
    if (!profile?.company_id) return
    if (!form.order_id) { setError('Please select an order'); return }
    setSaving(true); setError(null)
    try {
      const { error: e } = await supabase.from('dispatches').insert({
        company_id:              profile.company_id,
        order_id:                form.order_id,
        dispatch_type:           form.dispatch_type,
        status:                  'scheduled',
        scheduled_delivery_date: form.scheduled_delivery_date || null,
        scheduled_delivery_time: form.scheduled_delivery_time || null,
        scheduled_pickup_date:   form.scheduled_pickup_date || null,
        scheduled_pickup_time:   form.scheduled_pickup_time || null,
        delivery_address:        form.delivery_address || null,
        delivery_city:           form.delivery_city || null,
        delivery_state:          form.delivery_state || null,
        delivery_zip:            form.delivery_zip || null,
        contact_name:            form.contact_name || null,
        contact_phone:           form.contact_phone || null,
        delivery_notes:          form.delivery_notes || null,
        pickup_notes:            form.pickup_notes || null,
        route_notes:             form.route_notes || null,
      })
      if (e) throw e

      await supabase.from('rental_orders').update({ status: 'scheduled_for_dispatch' })
        .eq('id', form.order_id).in('status', ['confirmed', 'inventory_reserved'])

      clearDraft()
      navigate('/dispatch')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to create dispatch')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/dispatch') }

  const showDelivery = form.dispatch_type === 'delivery' || form.dispatch_type === 'both'
  const showPickup   = form.dispatch_type === 'pickup'   || form.dispatch_type === 'both'

  return (
    <PageShell>
      <PageHeader
        title="Create Dispatch"
        subtitle="Schedule a delivery, pickup, or both"
        actions={
          <button onClick={cancel} className="btn-secondary">
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

        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
          {/* Order + Type */}
          <div className="grid grid-cols-2 gap-4">
            <SelectField label="Order" required fieldClassName="col-span-2"
              value={form.order_id}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => patch({ order_id: e.target.value })}>
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

            <SelectField label="Dispatch Type"
              value={form.dispatch_type}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => patch({ dispatch_type: e.target.value })}>
              <option value="delivery">Delivery</option>
              <option value="pickup">Pickup</option>
              <option value="both">Delivery + Pickup</option>
            </SelectField>
          </div>

          {/* Schedule */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Schedule</p>
            <div className="grid grid-cols-2 gap-4">
              {showDelivery && <>
                <InputField label="Delivery Date" type="date" value={form.scheduled_delivery_date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ scheduled_delivery_date: e.target.value })} />
                <InputField label="Delivery Time" type="time" value={form.scheduled_delivery_time}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ scheduled_delivery_time: e.target.value })} />
              </>}
              {showPickup && <>
                <InputField label="Pickup Date" type="date" value={form.scheduled_pickup_date}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ scheduled_pickup_date: e.target.value })} />
                <InputField label="Pickup Time" type="time" value={form.scheduled_pickup_time}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ scheduled_pickup_time: e.target.value })} />
              </>}
            </div>
          </div>

          {/* Delivery address */}
          <div className="border-t border-border pt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Delivery Address</p>
            <div className="grid grid-cols-2 gap-4">
              <InputField label="Address" fieldClassName="col-span-2" value={form.delivery_address}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ delivery_address: e.target.value })} />
              <InputField label="City" value={form.delivery_city}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ delivery_city: e.target.value })} />
              <div className="grid grid-cols-2 gap-3">
                <InputField label="State" maxLength={2} value={form.delivery_state}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ delivery_state: e.target.value.toUpperCase() })} />
                <InputField label="ZIP" value={form.delivery_zip}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ delivery_zip: e.target.value })} />
              </div>
              <InputField label="Contact Name" value={form.contact_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ contact_name: e.target.value })} />
              <InputField label="Contact Phone" type="tel" value={form.contact_phone}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch({ contact_phone: e.target.value })} />
            </div>
          </div>

          {/* Notes */}
          <div className="border-t border-border pt-4 space-y-3">
            <TextareaField label="Delivery Notes" value={form.delivery_notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch({ delivery_notes: e.target.value })} />
            <TextareaField label="Route Notes" value={form.route_notes}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch({ route_notes: e.target.value })} />
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
            Create Dispatch
          </button>
        </div>
      </div>
    </PageShell>
  )
}
