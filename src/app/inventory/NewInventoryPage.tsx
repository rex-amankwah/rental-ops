import { useEffect, useState, ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { INVENTORY_CATEGORIES } from '@/lib/constants'

interface InventoryDraft {
  name: string
  sku: string
  category: string
  tracking_type: string
  rental_rate: string
  replacement_cost: string
  quantity_owned: string
  warehouse_location: string
  description: string
}

const BLANK: InventoryDraft = {
  name: '', sku: '', category: 'chairs', tracking_type: 'bulk',
  rental_rate: '0', replacement_cost: '0', quantity_owned: '0',
  warehouse_location: '', description: '',
}

const DRAFT_KEY = 'rental_ops_inventory_new_draft'

function loadDraft(): InventoryDraft | null {
  try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveDraft(d: InventoryDraft) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {}
}
function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY) } catch {}
}

export default function NewInventoryPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState<InventoryDraft>(loadDraft() ?? BLANK)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof InventoryDraft, string>>>({})

  useEffect(() => { saveDraft(form) }, [form])

  function set(k: keyof InventoryDraft, v: string) {
    setForm(p => ({ ...p, [k]: v }))
    if (fieldErrors[k]) setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })
  }

  function validate(): boolean {
    const e: Partial<Record<keyof InventoryDraft, string>> = {}
    if (!form.name.trim()) e.name = 'Item name is required'
    if (!form.category) e.category = 'Category is required'
    if (isNaN(parseFloat(form.rental_rate)) || parseFloat(form.rental_rate) < 0) e.rental_rate = 'Enter a valid rate'
    if (isNaN(parseInt(form.quantity_owned)) || parseInt(form.quantity_owned) < 0) e.quantity_owned = 'Enter a valid quantity'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate() || !profile?.company_id) return
    setSaving(true); setError(null)
    try {
      const qty = parseInt(form.quantity_owned) || 0
      const { error: e } = await supabase.from('inventory_catalog').insert({
        company_id:            profile.company_id,
        name:                  form.name.trim(),
        sku:                   form.sku.trim() || null,
        category:              form.category,
        tracking_type:         form.tracking_type,
        rental_rate:           parseFloat(form.rental_rate) || 0,
        replacement_cost:      parseFloat(form.replacement_cost) || 0,
        quantity_owned:        qty,
        quantity_available:    qty,
        quantity_reserved:     0,
        quantity_out:          0,
        quantity_damaged:      0,
        quantity_under_repair: 0,
        warehouse_location:    form.warehouse_location.trim() || null,
        description:           form.description.trim() || null,
        is_active:             true,
      })
      if (e) throw e
      clearDraft()
      navigate('/inventory')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Failed to save item')
    } finally { setSaving(false) }
  }

  function cancel() { clearDraft(); navigate('/inventory') }

  return (
    <PageShell>
      <PageHeader
        title="Add Inventory Item"
        subtitle="Add a new item to your rental catalog"
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

        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Name */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Item Name <span className="text-red-500">*</span></label>
              <input type="text" autoFocus value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('name', e.target.value)}
                placeholder="White Folding Chair"
                className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} />
              {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
            </div>

            {/* SKU */}
            <div className="space-y-1.5">
              <label className="form-label">SKU</label>
              <input type="text" value={form.sku}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('sku', e.target.value)}
                placeholder="CHR-WHT-001" className="form-input" />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="form-label">Category <span className="text-red-500">*</span></label>
              <select value={form.category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('category', e.target.value)}
                className="form-select">
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              {fieldErrors.category && <p className="text-xs text-red-600">{fieldErrors.category}</p>}
            </div>

            {/* Tracking type */}
            <div className="space-y-1.5">
              <label className="form-label">Tracking Type</label>
              <select value={form.tracking_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => set('tracking_type', e.target.value)}
                className="form-select">
                <option value="bulk">Bulk (count-based)</option>
                <option value="serialized">Serialized (individual)</option>
              </select>
            </div>

            {/* Rental rate */}
            <div className="space-y-1.5">
              <label className="form-label">Rate / Day ($) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" value={form.rental_rate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('rental_rate', e.target.value)}
                className={`form-input ${fieldErrors.rental_rate ? 'border-red-400' : ''}`} />
              {fieldErrors.rental_rate && <p className="text-xs text-red-600">{fieldErrors.rental_rate}</p>}
            </div>

            {/* Replacement cost */}
            <div className="space-y-1.5">
              <label className="form-label">Replacement Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('replacement_cost', e.target.value)}
                className="form-input" />
            </div>

            {/* Quantity owned */}
            <div className="space-y-1.5">
              <label className="form-label">Quantity Owned <span className="text-red-500">*</span></label>
              <input type="number" min="0" value={form.quantity_owned}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('quantity_owned', e.target.value)}
                className={`form-input ${fieldErrors.quantity_owned ? 'border-red-400' : ''}`} />
              {fieldErrors.quantity_owned && <p className="text-xs text-red-600">{fieldErrors.quantity_owned}</p>}
            </div>

            {/* Warehouse location */}
            <div className="space-y-1.5">
              <label className="form-label">Warehouse Location</label>
              <input type="text" value={form.warehouse_location}
                onChange={(e: ChangeEvent<HTMLInputElement>) => set('warehouse_location', e.target.value)}
                placeholder="Bay A" className="form-input" />
            </div>

            {/* Description */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Description</label>
              <textarea value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => set('description', e.target.value)}
                placeholder="Optional notes about this item…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={cancel} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Plus className="w-4 h-4" /> Add Item</>}
          </button>
        </div>
      </div>
    </PageShell>
  )
}
