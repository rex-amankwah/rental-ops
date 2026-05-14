import { useEffect, useState, ChangeEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { PageShell, PageHeader } from '@/components/common/PageShell'
import { INVENTORY_CATEGORIES } from '@/lib/constants'
import type { InventoryCatalogItem } from '@/types/database'

interface InventoryForm {
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

function toForm(item: InventoryCatalogItem): InventoryForm {
  return {
    name:               item.name,
    sku:                item.sku ?? '',
    category:           item.category,
    tracking_type:      item.tracking_type,
    rental_rate:        String(item.rental_rate),
    replacement_cost:   String(item.replacement_cost),
    quantity_owned:     String(item.quantity_owned),
    warehouse_location: item.warehouse_location ?? '',
    description:        item.description ?? '',
  }
}

export default function EditInventoryPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [form, setForm] = useState<InventoryForm | null>(null)
  const [original, setOriginal] = useState<InventoryCatalogItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof InventoryForm, string>>>({})

  const fetchItem = useCallback(async () => {
    if (!id || !profile?.company_id) return
    setLoading(true)
    const { data, error: e } = await supabase
      .from('inventory_catalog')
      .select('*')
      .eq('id', id)
      .eq('company_id', profile.company_id)
      .single()
    if (e || !data) {
      setError('Inventory item not found')
    } else {
      const item = data as InventoryCatalogItem
      setOriginal(item)
      setForm(toForm(item))
    }
    setLoading(false)
  }, [id, profile?.company_id])

  useEffect(() => { fetchItem() }, [fetchItem])

  function patch(k: keyof InventoryForm, v: string) {
    setForm(p => p ? { ...p, [k]: v } : p)
    if (fieldErrors[k]) setFieldErrors(p => { const n = { ...p }; delete n[k]; return n })
  }

  function validate(): boolean {
    if (!form) return false
    const e: Partial<Record<keyof InventoryForm, string>> = {}
    if (!form.name.trim()) e.name = 'Item name is required'
    if (!form.category) e.category = 'Category is required'
    if (isNaN(parseFloat(form.rental_rate)) || parseFloat(form.rental_rate) < 0) e.rental_rate = 'Enter a valid rate'
    if (isNaN(parseInt(form.quantity_owned)) || parseInt(form.quantity_owned) < 0) e.quantity_owned = 'Enter a valid quantity'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function save() {
    if (!validate() || !form || !id || !profile?.company_id || !original) return
    setSaving(true); setError(null)
    try {
      const newOwned = parseInt(form.quantity_owned) || 0
      const delta = newOwned - original.quantity_owned
      const newAvailable = Math.max(0, original.quantity_available + delta)

      const { error: e } = await supabase
        .from('inventory_catalog')
        .update({
          name:               form.name.trim(),
          sku:                form.sku.trim() || null,
          category:           form.category,
          tracking_type:      form.tracking_type,
          rental_rate:        parseFloat(form.rental_rate) || 0,
          replacement_cost:   parseFloat(form.replacement_cost) || 0,
          quantity_owned:     newOwned,
          quantity_available: newAvailable,
          warehouse_location: form.warehouse_location.trim() || null,
          description:        form.description.trim() || null,
          updated_at:         new Date().toISOString(),
        })
        .eq('id', id)
        .eq('company_id', profile.company_id)
      if (e) throw e
      navigate('/inventory')
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
        <p className="text-sm text-muted-foreground">{error ?? 'Item not found'}</p>
        <button onClick={() => navigate('/inventory')} className="btn-secondary mt-4">Back to Inventory</button>
      </div>
    )
  }

  const origOwned = original?.quantity_owned ?? 0
  const origAvailable = original?.quantity_available ?? 0
  const newOwned = parseInt(form.quantity_owned) || 0
  const delta = newOwned - origOwned
  const projectedAvailable = Math.max(0, origAvailable + delta)

  return (
    <PageShell>
      <PageHeader
        title="Edit Inventory Item"
        subtitle={form.name}
        actions={
          <button onClick={() => navigate('/inventory')} className="btn-secondary">
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
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Item Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('name', e.target.value)}
                className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} />
              {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">SKU</label>
              <input type="text" value={form.sku}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('sku', e.target.value)}
                className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Category <span className="text-red-500">*</span></label>
              <select value={form.category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('category', e.target.value)}
                className="form-select">
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              {fieldErrors.category && <p className="text-xs text-red-600">{fieldErrors.category}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Tracking Type</label>
              <select value={form.tracking_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('tracking_type', e.target.value)}
                className="form-select">
                <option value="bulk">Bulk (count-based)</option>
                <option value="serialized">Serialized (individual)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Rate / Day ($) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" value={form.rental_rate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('rental_rate', e.target.value)}
                className={`form-input ${fieldErrors.rental_rate ? 'border-red-400' : ''}`} />
              {fieldErrors.rental_rate && <p className="text-xs text-red-600">{fieldErrors.rental_rate}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Replacement Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('replacement_cost', e.target.value)}
                className="form-input" />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Quantity Owned <span className="text-red-500">*</span></label>
              <input type="number" min="0" value={form.quantity_owned}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('quantity_owned', e.target.value)}
                className={`form-input ${fieldErrors.quantity_owned ? 'border-red-400' : ''}`} />
              {fieldErrors.quantity_owned && <p className="text-xs text-red-600">{fieldErrors.quantity_owned}</p>}
              {delta !== 0 && (
                <p className="text-xs text-muted-foreground">
                  Available will adjust: {origAvailable} → {projectedAvailable}
                  {delta > 0 ? ` (+${delta})` : ` (${delta})`}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Warehouse Location</label>
              <input type="text" value={form.warehouse_location}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('warehouse_location', e.target.value)}
                placeholder="Bay A" className="form-input" />
            </div>

            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Description</label>
              <textarea value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('description', e.target.value)}
                placeholder="Optional notes about this item…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate('/inventory')} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </PageShell>
  )
}
