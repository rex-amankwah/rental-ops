import { useState, useEffect, useCallback, ChangeEvent, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, Plus, Trash2, Search,
  AlertTriangle, CheckCircle2, Loader2, User, Package
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAvailability } from '@/hooks/useAvailability'
import { InputField, SelectField, TextareaField } from '@/components/common/FormField'
import { TimeSelect } from '@/components/common/TimeSelect'
import { formatCurrency } from '@/lib/constants'
import type { Customer, InventoryCatalogItem } from '@/types/database'

// ─── Types ───────────────────────────────────────────────────────────────────

interface OrderLineItem {
  id: string
  catalog_item_id: string
  item_name_snapshot: string
  item_sku_snapshot: string
  category_snapshot: string
  unit_rate: number
  quantity: number
  rental_days: number
  line_total: number
  availability?: number
  availabilityLoading?: boolean
}

interface OrderFormData {
  customer_id: string
  event_name: string
  event_type: string
  event_date: string
  event_end_date: string
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
  rental_days: string
  delivery_fee: string
  setup_fee: string
  discount_amount: string
  status: string
  priority: string
  source: string
  internal_notes: string
  customer_notes: string
}

const BLANK_FORM: OrderFormData = {
  customer_id: '', event_name: '', event_type: '', event_date: '',
  event_end_date: '', guest_count: '', venue_name: '', venue_address: '',
  venue_city: '', venue_state: 'TX', venue_zip: '', venue_notes: '',
  delivery_date: '', delivery_time: '', pickup_date: '', pickup_time: '',
  rental_days: '1', delivery_fee: '0', setup_fee: '0', discount_amount: '0',
  status: 'inquiry', priority: 'normal', source: '', internal_notes: '', customer_notes: '',
}

const DRAFT_KEY = 'rentalops_new_order_draft'

// Serialise/deserialise draft — availability fields are ephemeral, strip them
function saveDraft(form: OrderFormData, items: OrderLineItem[], step: number) {
  try {
    const cleanItems = items.map(({ availability: _a, availabilityLoading: _b, ...rest }) => rest)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, items: cleanItems, step }))
  } catch { /* quota exceeded — ignore */ }
}

function loadDraft(): { form: OrderFormData; items: OrderLineItem[]; step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ }
}

const EVENT_TYPES = [
  'Wedding', 'Quinceañera', 'Birthday', 'Corporate', 'Baby Shower',
  'Graduation', 'Festival', 'Reunion', 'Religious', 'Other',
]
const SOURCES = ['Phone', 'Walk-in', 'Website', 'Referral', 'Facebook', 'Instagram', 'Google', 'Other']
const STATUSES = ['inquiry', 'quote_sent', 'awaiting_deposit', 'confirmed']

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
]

function localId() { return Math.random().toString(36).slice(2) }

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  const labels = ['Customer', 'Event & Venue', 'Items', 'Review']
  return (
    <div className="flex items-center gap-0 mb-8">
      {labels.slice(0, total).map((label, i) => (
        <Fragment key={label}>
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
              i < step ? 'bg-primary text-primary-foreground' :
              i === step ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={`text-sm font-medium hidden sm:block ${
              i === step ? 'text-foreground' : 'text-muted-foreground'
            }`}>{label}</span>
          </div>
          {i < total - 1 && (
            <div className={`flex-1 h-px mx-3 ${i < step ? 'bg-primary' : 'bg-border'}`} />
          )}
        </Fragment>
      ))}
    </div>
  )
}

// ─── Step 1: Customer ─────────────────────────────────────────────────────────

function CustomerStep({
  form, onChange, error,
}: {
  form: OrderFormData
  onChange: (k: keyof OrderFormData, v: string) => void
  error?: string
}) {
  const { profile } = useAuth()
  const [search, setSearch] = useState('')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [selected, setSelected] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!profile?.company_id) return
    setLoading(true)
    const timer = setTimeout(async () => {
      let q = supabase.from('customers').select('*')
        .eq('company_id', profile.company_id).eq('is_active', true)
      if (search) q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,company_name.ilike.%${search}%`)
      const { data } = await q.order('last_name').limit(20)
      setCustomers(data ?? [])
      setLoading(false)
    }, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, profile?.company_id])

  // Restore selected customer from draft customer_id
  useEffect(() => {
    if (form.customer_id && !selected) {
      supabase.from('customers').select('*').eq('id', form.customer_id).single()
        .then(({ data }) => { if (data) setSelected(data as Customer) })
    }
    if (!form.customer_id) setSelected(null)
  }, [form.customer_id, selected])

  function select(c: Customer) {
    setSelected(c)
    onChange('customer_id', c.id)
  }

  return (
    <div className="space-y-5">
      {selected && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {selected.first_name} {selected.last_name}
              {selected.company_name && <span className="text-muted-foreground"> · {selected.company_name}</span>}
            </p>
            <p className="text-xs text-muted-foreground">{selected.email ?? selected.phone ?? 'No contact info'}</p>
          </div>
          <button
            onClick={() => { setSelected(null); onChange('customer_id', '') }}
            className="btn-ghost p-1.5 text-xs"
          >Change</button>
        </div>
      )}

      {!selected && (
        <>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search customers by name, email, or company…"
              value={search}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              className="search-input pl-10 h-10"
              autoFocus
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="space-y-1 max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && customers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">
                  {search ? 'No customers match that search.' : 'No customers yet. Add one from the Customers page first.'}
                </p>
              </div>
            )}
            {customers.map(c => (
              <button
                key={c.id}
                onClick={() => select(c)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted text-left transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    {c.first_name[0]}{c.last_name[0]}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {c.first_name} {c.last_name}
                    {c.company_name && <span className="text-muted-foreground font-normal"> · {c.company_name}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{c.email ?? c.phone ?? ''}</p>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">{c.total_orders} orders</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Step 2: Event & Venue ────────────────────────────────────────────────────

function EventStep({ form, onChange }: {
  form: OrderFormData
  onChange: (k: keyof OrderFormData, v: string) => void
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Event Name"
          placeholder="Smith Wedding Reception"
          value={form.event_name}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('event_name', e.target.value)}
          fieldClassName="col-span-2"
        />
        <SelectField
          label="Event Type"
          value={form.event_type}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange('event_type', e.target.value)}
        >
          <option value="">Select type…</option>
          {EVENT_TYPES.map(t => <option key={t} value={t.toLowerCase()}>{t}</option>)}
        </SelectField>
        <InputField
          label="Guest Count"
          type="number"
          min="1"
          placeholder="150"
          value={form.guest_count}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('guest_count', e.target.value)}
        />
        <InputField
          label="Event Date"
          required
          type="date"
          value={form.event_date}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('event_date', e.target.value)}
        />
        <InputField
          label="Event End Date"
          type="date"
          value={form.event_end_date}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('event_end_date', e.target.value)}
        />
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3">Venue</h3>
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Venue Name"
            placeholder="La Fiesta Hall"
            value={form.venue_name}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('venue_name', e.target.value)}
            fieldClassName="col-span-2"
          />
          <InputField
            label="Address"
            placeholder="123 Main St"
            value={form.venue_address}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('venue_address', e.target.value)}
            fieldClassName="col-span-2"
          />
          <InputField
            label="City"
            value={form.venue_city}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('venue_city', e.target.value)}
          />
          {/* State + ZIP */}
          <div className="grid grid-cols-2 gap-3">
            {/* State dropdown */}
            <div className="space-y-1.5">
              <label className="form-label">State</label>
              <select
                value={form.venue_state}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange('venue_state', e.target.value)}
                className="form-select"
              >
                {US_STATES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <InputField
              label="ZIP"
              placeholder="77001"
              value={form.venue_zip}
              onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('venue_zip', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3">Delivery & Pickup</h3>
        <div className="grid grid-cols-2 gap-4">
          <InputField
            label="Delivery Date"
            type="date"
            value={form.delivery_date}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('delivery_date', e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="form-label">Delivery Time</label>
            <TimeSelect
              value={form.delivery_time}
              onChange={(v) => onChange('delivery_time', v)}
            />
          </div>
          <InputField
            label="Pickup Date"
            type="date"
            value={form.pickup_date}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('pickup_date', e.target.value)}
          />
          <div className="space-y-1.5">
            <label className="form-label">Pickup Time</label>
            <TimeSelect
              value={form.pickup_time}
              onChange={(v) => onChange('pickup_time', v)}
            />
          </div>
          <InputField
            label="Rental Days"
            type="number"
            min="1"
            required
            value={form.rental_days}
            onChange={(e: ChangeEvent<HTMLInputElement>) => onChange('rental_days', e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3">Order Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Status"
            value={form.status}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange('status', e.target.value)}
          >
            {STATUSES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </SelectField>
          <SelectField
            label="Priority"
            value={form.priority}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange('priority', e.target.value)}
          >
            {['low','normal','high','urgent'].map(p => (
              <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
            ))}
          </SelectField>
          <SelectField
            label="Source"
            value={form.source}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange('source', e.target.value)}
          >
            <option value="">Select source…</option>
            {SOURCES.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </SelectField>
        </div>
        <div className="mt-4 space-y-4">
          <TextareaField
            label="Customer Notes"
            placeholder="Visible on invoice…"
            value={form.customer_notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange('customer_notes', e.target.value)}
          />
          <TextareaField
            label="Internal Notes"
            placeholder="Internal only — not printed…"
            value={form.internal_notes}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange('internal_notes', e.target.value)}
          />
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Items ────────────────────────────────────────────────────────────

function ItemsStep({
  items, onAdd, onUpdate, onRemove, deliveryDate, pickupDate,
}: {
  items: OrderLineItem[]
  onAdd: (item: InventoryCatalogItem) => void
  onUpdate: (id: string, field: keyof OrderLineItem, value: string | number) => void
  onRemove: (id: string) => void
  deliveryDate: string
  pickupDate: string
}) {
  const { profile } = useAuth()
  const [catalog, setCatalog] = useState<InventoryCatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCatalog, setShowCatalog] = useState(false)
  // Track which catalog_item_ids are already on the order for dup detection
  const existingIds = new Set(items.map(i => i.catalog_item_id))

  useEffect(() => {
    if (!profile?.company_id || !showCatalog) return
    setLoading(true)
    const timer = setTimeout(async () => {
      let q = supabase.from('inventory_catalog').select('*')
        .eq('company_id', profile.company_id).eq('is_active', true)
      if (search) q = q.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
      const { data } = await q.order('name').limit(30)
      setCatalog(data ?? [])
      setLoading(false)
    }, search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [search, profile?.company_id, showCatalog])

  function handleAdd(cat: InventoryCatalogItem) {
    // Duplicate check: if item already on order, increase quantity instead
    const existing = items.find(i => i.catalog_item_id === cat.id)
    if (existing) {
      onUpdate(existing.id, 'quantity', existing.quantity + 1)
      setShowCatalog(false)
      setSearch('')
      return
    }
    onAdd(cat)
    setShowCatalog(false)
    setSearch('')
  }

  const subtotal = items.reduce((a, i) => a + i.line_total, 0)

  return (
    <div className="space-y-4">
      {!deliveryDate && !pickupDate && (
        <div className="alert alert-warning">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Set delivery and pickup dates in the previous step to enable live availability checking.</span>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right w-20">Qty</th>
                <th className="text-right w-28">Rate / Day</th>
                <th className="text-right w-20">Days</th>
                <th className="text-right w-28">Line Total</th>
                <th className="text-right w-24">Available</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>
                    <p className="text-sm font-medium text-foreground">{item.item_name_snapshot}</p>
                    {item.item_sku_snapshot && <p className="text-xs text-muted-foreground font-mono">{item.item_sku_snapshot}</p>}
                  </td>
                  <td className="text-right">
                    <input
                      type="number" min="1"
                      value={item.quantity}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdate(item.id, 'quantity', parseInt(e.target.value) || 1)}
                      className="form-input w-16 text-right px-2 py-1 text-sm h-8"
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number" min="0" step="0.01"
                      value={item.unit_rate}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdate(item.id, 'unit_rate', parseFloat(e.target.value) || 0)}
                      className="form-input w-24 text-right px-2 py-1 text-sm h-8"
                    />
                  </td>
                  <td className="text-right">
                    <input
                      type="number" min="1"
                      value={item.rental_days}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => onUpdate(item.id, 'rental_days', parseInt(e.target.value) || 1)}
                      className="form-input w-16 text-right px-2 py-1 text-sm h-8"
                    />
                  </td>
                  <td className="text-right text-sm font-medium">{formatCurrency(item.line_total)}</td>
                  <td className="text-right">
                    {item.availabilityLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto text-muted-foreground" />
                    ) : item.availability !== undefined ? (
                      <span className={`text-xs font-medium ${
                        item.availability >= item.quantity ? 'text-emerald-600' :
                        item.availability > 0 ? 'text-amber-600' : 'text-red-600'
                      }`}>
                        {item.availability >= item.quantity ? '✓' : item.availability} avail
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="btn-ghost p-1.5 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="text-right text-sm font-semibold text-muted-foreground">Subtotal</td>
                <td className="text-right text-sm font-bold">{formatCurrency(subtotal)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <button
        onClick={() => setShowCatalog(v => !v)}
        className="btn-secondary w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Rental Item
      </button>

      {showCatalog && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="search"
                placeholder="Search inventory catalog…"
                value={search}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
                className="search-input pl-9 h-9"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && catalog.map(cat => {
              const isDuplicate = existingIds.has(cat.id)
              return (
                <button
                  key={cat.id}
                  onClick={() => handleAdd(cat)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left transition-colors border-b border-border/50 last:border-0"
                >
                  <Package className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {cat.name}
                      {isDuplicate && <span className="text-xs text-amber-600 ml-2">(already added — will increase qty)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{cat.sku} · {formatCurrency(cat.rental_rate)}/day</p>
                  </div>
                  <span className={`text-xs flex-shrink-0 font-medium ${
                    cat.quantity_available > 5 ? 'text-emerald-600' :
                    cat.quantity_available > 0 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {cat.quantity_available} avail
                  </span>
                </button>
              )
            })}
            {!loading && catalog.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No items found</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step 4: Review ───────────────────────────────────────────────────────────

function ReviewStep({ form, items, customer, onFeeChange }: {
  form: OrderFormData
  items: OrderLineItem[]
  customer: Customer | null
  onFeeChange: (k: keyof OrderFormData, v: string) => void
}) {
  const subtotal  = items.reduce((a, i) => a + i.line_total, 0)
  const delivery  = parseFloat(form.delivery_fee) || 0
  const setup     = parseFloat(form.setup_fee) || 0
  const discount  = parseFloat(form.discount_amount) || 0
  const taxable   = subtotal + delivery + setup - discount
  const tax       = Math.round(taxable * 0.0825 * 100) / 100
  const total     = taxable + tax

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Customer</h3>
        <p className="text-sm text-foreground">
          {customer
            ? `${customer.first_name} ${customer.last_name}`
            : <span className="text-red-600">No customer selected</span>}
          {customer?.company_name && <span className="text-muted-foreground"> · {customer.company_name}</span>}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Event</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {([
            ['Name',        form.event_name || '—'],
            ['Type',        form.event_type || '—'],
            ['Date',        form.event_date || '—'],
            ['Guests',      form.guest_count || '—'],
            ['Venue',       [form.venue_name, form.venue_city, form.venue_state].filter(Boolean).join(', ') || '—'],
            ['Delivery',    form.delivery_date ? `${form.delivery_date}${form.delivery_time ? ' ' + form.delivery_time : ''}` : '—'],
            ['Pickup',      form.pickup_date ? `${form.pickup_date}${form.pickup_time ? ' ' + form.pickup_time : ''}` : '—'],
            ['Rental Days', form.rental_days],
          ] as [string, string][]).map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-muted-foreground w-24 flex-shrink-0">{k}</span>
              <span className="text-foreground">{v}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Items ({items.length})</h3>
        {items.length === 0
          ? <p className="text-sm text-amber-600">No items — order will save but cannot be reserved.</p>
          : <div className="space-y-1">
              {items.map(i => (
                <div key={i.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{i.item_name_snapshot} × {i.quantity}</span>
                  <span className="text-muted-foreground">{formatCurrency(i.line_total)}</span>
                </div>
              ))}
            </div>
        }
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Financials</h3>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          {(['delivery_fee', 'setup_fee', 'discount_amount'] as const).map((field) => (
            <div key={field} className="flex items-center justify-between text-sm gap-3">
              <span className="text-muted-foreground capitalize">
                {field === 'delivery_fee' ? 'Delivery Fee' : field === 'setup_fee' ? 'Setup Fee' : 'Discount'}
              </span>
              <input
                type="number" min="0" step="0.01"
                value={form[field]}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onFeeChange(field, e.target.value)}
                className="form-input w-28 text-right px-2 py-1 text-sm h-8"
              />
            </div>
          ))}
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Tax (8.25%)</span>
            <span>{formatCurrency(tax)}</span>
          </div>
          <div className="flex justify-between text-base font-semibold pt-2 border-t border-border">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NewOrderPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { checkAvailability } = useAvailability()

  // Initialise from localStorage draft if present
  const draft = loadDraft()
  const [step, setStep] = useState(draft?.step ?? 0)
  const [form, setForm] = useState<OrderFormData>(draft?.form ?? BLANK_FORM)
  const [items, setItems] = useState<OrderLineItem[]>(draft?.items ?? [])
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({})

  const fromDate  = form.delivery_date || form.event_date
  const untilDate = form.pickup_date || (fromDate
    ? new Date(new Date(fromDate).getTime() + (parseInt(form.rental_days) || 1) * 86400000).toISOString().split('T')[0]
    : fromDate)

  // Persist draft to localStorage on every meaningful change
  useEffect(() => {
    saveDraft(form, items, step)
  }, [form, items, step])

  // Load customer object when customer_id is set (e.g. restored from draft)
  useEffect(() => {
    if (!form.customer_id) { setCustomer(null); return }
    supabase.from('customers').select('*').eq('id', form.customer_id).single()
      .then(({ data }) => { if (data) setCustomer(data as Customer) })
  }, [form.customer_id])

  // Sync rental_days to all item lines when it changes
  useEffect(() => {
    const days = parseInt(form.rental_days) || 1
    setItems(prev => prev.map(i => ({
      ...i,
      rental_days: days,
      line_total: Math.round(i.quantity * i.unit_rate * days * 100) / 100,
    })))
  }, [form.rental_days])

  function onChange(k: keyof OrderFormData, v: string) {
    setForm(prev => ({ ...prev, [k]: v }))
    setStepErrors(prev => { const n = { ...prev }; delete n[step]; return n })
  }

  function addItem(cat: InventoryCatalogItem) {
    const days = parseInt(form.rental_days) || 1
    const newItem: OrderLineItem = {
      id: localId(),
      catalog_item_id: cat.id,
      item_name_snapshot: cat.name,
      item_sku_snapshot: cat.sku ?? '',
      category_snapshot: cat.category,
      unit_rate: cat.rental_rate,
      quantity: 1,
      rental_days: days,
      line_total: Math.round(cat.rental_rate * days * 100) / 100,
      availability: undefined,
      availabilityLoading: !!fromDate,
    }
    setItems(prev => [...prev, newItem])

    if (fromDate) {
      checkAvailability(cat.id, fromDate, untilDate).then(avail => {
        setItems(prev => prev.map(i =>
          i.id === newItem.id ? { ...i, availability: avail, availabilityLoading: false } : i
        ))
      })
    }
  }

  function updateItem(id: string, field: keyof OrderLineItem, value: string | number) {
    setItems(prev => prev.map(i => {
      if (i.id !== id) return i
      const updated = { ...i, [field]: value }
      updated.line_total = Math.round(updated.quantity * updated.unit_rate * updated.rental_days * 100) / 100
      return updated
    }))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function validateStep(s: number): boolean {
    if (s === 0 && !form.customer_id) {
      setStepErrors(prev => ({ ...prev, 0: 'Please select a customer.' }))
      return false
    }
    if (s === 1 && !form.event_date) {
      setStepErrors(prev => ({ ...prev, 1: 'Event date is required.' }))
      return false
    }
    return true
  }

  function nextStep() {
    if (!validateStep(step)) return
    setStep(s => Math.min(s + 1, 3))
  }

  function prevStep() { setStep(s => Math.max(s - 1, 0)) }

  const saveOrder = useCallback(async () => {
    if (!profile?.company_id) {
      setError('No company found. Please reload and try again.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const subtotal = items.reduce((a, i) => a + i.line_total, 0)
      const delivery = parseFloat(form.delivery_fee) || 0
      const setup    = parseFloat(form.setup_fee) || 0
      const discount = parseFloat(form.discount_amount) || 0
      const taxable  = subtotal + delivery + setup - discount
      const tax      = Math.round(taxable * 0.0825 * 100) / 100
      const total    = taxable + tax

      // ── Insert into public.rental_orders ──
      const { data: orderData, error: orderErr } = await supabase
        .from('rental_orders')
        .insert({
          company_id:      profile.company_id,
          customer_id:     form.customer_id || null,
          status:          form.status,
          priority:        form.priority,
          event_name:      form.event_name.trim() || null,
          event_type:      form.event_type || null,
          event_date:      form.event_date || null,
          event_end_date:  form.event_end_date || null,
          guest_count:     parseInt(form.guest_count) || null,
          venue_name:      form.venue_name.trim() || null,
          venue_address:   form.venue_address.trim() || null,
          venue_city:      form.venue_city.trim() || null,
          venue_state:     form.venue_state || null,
          venue_zip:       form.venue_zip.trim() || null,
          venue_notes:     form.venue_notes.trim() || null,
          delivery_date:   form.delivery_date || null,
          delivery_time:   form.delivery_time || null,
          pickup_date:     form.pickup_date || null,
          pickup_time:     form.pickup_time || null,
          rental_days:     parseInt(form.rental_days) || 1,
          source:          form.source || null,
          internal_notes:  form.internal_notes.trim() || null,
          customer_notes:  form.customer_notes.trim() || null,
          subtotal,
          delivery_fee:    delivery,
          setup_fee:       setup,
          discount_amount: discount,
          tax_amount:      tax,
          total_amount:    total,
          balance_due:     total,
          amount_paid:     0,
          deposit_required: 0,
          deposit_paid:    0,
          created_by:      profile.id,
        })
        .select('id, order_number')
        .single()

      if (orderErr) {
        console.error('[NewOrderPage] rental_orders insert error:', orderErr)
        throw new Error(`Order insert failed: ${orderErr.message}${orderErr.details ? ' — ' + orderErr.details : ''}${orderErr.hint ? ' — Hint: ' + orderErr.hint : ''}`)
      }
      if (!orderData) {
        throw new Error('Order was not returned after insert. Check Supabase RLS SELECT policy on rental_orders.')
      }

      const orderId = orderData.id

      // ── Insert into public.order_items ──
      if (items.length > 0) {
        const orderItems = items.map((item, idx) => ({
          company_id:         profile.company_id,
          order_id:           orderId,
          catalog_item_id:    item.catalog_item_id,
          item_name_snapshot: item.item_name_snapshot,
          item_sku_snapshot:  item.item_sku_snapshot || null,
          category_snapshot:  item.category_snapshot || null,
          quantity:           item.quantity,
          unit_rate:          item.unit_rate,
          rental_days:        item.rental_days,
          line_total:         item.line_total,
          reservation_status: 'pending' as const,
          sort_order:         idx,
        }))

        const { error: itemsErr } = await supabase
          .from('order_items')
          .insert(orderItems)

        if (itemsErr) {
          console.error('[NewOrderPage] order_items insert error:', itemsErr)
          throw new Error(`Items insert failed: ${itemsErr.message}${itemsErr.details ? ' — ' + itemsErr.details : ''}`)
        }
      }

      // ── Log activity (non-blocking — don't fail the save if this errors) ──
      supabase.from('activity_logs').insert({
        company_id:  profile.company_id,
        order_id:    orderId,
        actor_id:    profile.id,
        actor_name:  profile.full_name ?? profile.email,
        entity_type: 'order',
        entity_id:   orderId,
        action:      'created',
        description: `Order ${orderData.order_number} created with ${items.length} item${items.length !== 1 ? 's' : ''}, total ${formatCurrency(total)}`,
        new_value:   JSON.parse(JSON.stringify({ status: form.status, total })),
      }).then(({ error: logErr }) => {
        if (logErr) console.warn('[NewOrderPage] activity_log insert failed (non-critical):', logErr.message)
      })

      // Clear draft on success
      clearDraft()
      navigate(`/orders/${orderId}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[NewOrderPage] saveOrder failed:', msg)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }, [form, items, profile, navigate])

  const TOTAL_STEPS = 4

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/orders')} className="btn-ghost p-2">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">New Rental Order</h1>
          <p className="text-sm text-muted-foreground">Step {step + 1} of {TOTAL_STEPS}</p>
        </div>
        {/* Draft restore notice */}
        {draft && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded">
              Draft restored
            </span>
            <button
              onClick={() => {
                clearDraft()
                setForm(BLANK_FORM)
                setItems([])
                setStep(0)
              }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Start fresh
            </button>
          </div>
        )}
      </div>

      <StepIndicator step={step} total={TOTAL_STEPS} />

      {/* Step content */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        {step === 0 && <CustomerStep form={form} onChange={onChange} error={stepErrors[0]} />}
        {step === 1 && <EventStep form={form} onChange={onChange} />}
        {step === 2 && (
          <ItemsStep
            items={items}
            onAdd={addItem}
            onUpdate={updateItem}
            onRemove={removeItem}
            deliveryDate={form.delivery_date}
            pickupDate={form.pickup_date}
          />
        )}
        {step === 3 && (
          <ReviewStep form={form} items={items} customer={customer} onFeeChange={onChange} />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-sm">Failed to create order</p>
            <p className="text-xs mt-0.5 opacity-90">{error}</p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevStep} disabled={step === 0} className="btn-secondary">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        {step < TOTAL_STEPS - 1 ? (
          <button onClick={nextStep} className="btn-primary">
            Continue <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={saveOrder} disabled={saving || !form.customer_id} className="btn-primary">
            {saving
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
              : <><CheckCircle2 className="w-4 h-4" /> Create Order</>}
          </button>
        )}
      </div>
    </div>
  )
}
