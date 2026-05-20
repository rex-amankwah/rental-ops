import { useEffect, useState, ChangeEvent, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, AlertTriangle, Info } from 'lucide-react'
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
  // Valuation
  unit_purchase_cost: string
  vendor_name: string
  purchase_date: string
  expected_lifespan_months: string
  depreciation_method: string
  residual_value: string
  damage_fee_default: string
  replacement_fee_default: string
  condition_notes: string
  reorder_point: string
}

// ─── Tracking type helper text ────────────────────────────────────────────────

const TRACKING_HELPER: Record<string, string> = {
  bulk:       'Best for chairs, tables, linens, and quantity-based inventory. Tracks quantities only — no individual asset IDs.',
  serialized: 'Best for high-value equipment like speakers and projectors. Each item is individually tracked and prepared for future QR/barcode workflows.',
  hybrid:     'Best for premium rental inventory that may occasionally need individual tracking. Combines quantity tracking with flexible asset-level workflows.',
}

function toForm(item: InventoryCatalogItem): InventoryForm {
  return {
    name:                      item.name,
    sku:                       item.sku ?? '',
    category:                  item.category,
    tracking_type:             item.tracking_type,
    rental_rate:               String(item.rental_rate),
    replacement_cost:          String(item.replacement_cost),
    quantity_owned:            String(item.quantity_owned),
    warehouse_location:        item.warehouse_location ?? '',
    description:               item.description ?? '',
    unit_purchase_cost:        item.unit_purchase_cost != null ? String(item.unit_purchase_cost)
                               : item.purchase_cost != null ? String(item.purchase_cost) : '',
    vendor_name:               item.vendor_name ?? '',
    purchase_date:             item.purchase_date ?? '',
    expected_lifespan_months:  item.expected_lifespan_months != null ? String(item.expected_lifespan_months) : '',
    depreciation_method:       item.depreciation_method ?? 'none',
    residual_value:            item.residual_value != null ? String(item.residual_value) : '0',
    damage_fee_default:        item.damage_fee_default != null ? String(item.damage_fee_default) : '',
    replacement_fee_default:   item.replacement_fee_default != null ? String(item.replacement_fee_default) : '',
    condition_notes:           item.condition_notes ?? '',
    reorder_point:             item.reorder_point != null ? String(item.reorder_point) : '',
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
    if (form.reorder_point && (isNaN(parseInt(form.reorder_point)) || parseInt(form.reorder_point) < 0)) e.reorder_point = 'Enter a valid reorder point'
    if (form.expected_lifespan_months && (isNaN(parseInt(form.expected_lifespan_months)) || parseInt(form.expected_lifespan_months) <= 0)) {
      e.expected_lifespan_months = 'Enter a positive number of months'
    }
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
          name:                      form.name.trim(),
          sku:                       form.sku.trim() || null,
          category:                  form.category,
          tracking_type:             form.tracking_type,
          rental_rate:               parseFloat(form.rental_rate) || 0,
          replacement_cost:          parseFloat(form.replacement_cost) || 0,
          quantity_owned:            newOwned,
          quantity_available:        newAvailable,
          warehouse_location:        form.warehouse_location.trim() || null,
          description:               form.description.trim() || null,
          unit_purchase_cost:        form.unit_purchase_cost ? parseFloat(form.unit_purchase_cost) : null,
          vendor_name:               form.vendor_name.trim() || null,
          purchase_date:             form.purchase_date || null,
          expected_lifespan_months:  form.expected_lifespan_months ? parseInt(form.expected_lifespan_months) : null,
          depreciation_method:       form.depreciation_method === 'none' ? 'none' : (form.depreciation_method || null),
          residual_value:            parseFloat(form.residual_value) || 0,
          damage_fee_default:        form.damage_fee_default ? parseFloat(form.damage_fee_default) : null,
          replacement_fee_default:   form.replacement_fee_default ? parseFloat(form.replacement_fee_default) : null,
          condition_notes:           form.condition_notes.trim() || null,
          reorder_point:             form.reorder_point ? parseInt(form.reorder_point) : null,
          updated_at:                new Date().toISOString(),
        })
        .eq('id', id)
        .eq('company_id', profile.company_id)
      if (e) throw e
      navigate(`/inventory/${id}`)
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

  const origOwned      = original?.quantity_owned    ?? 0
  const origAvailable  = original?.quantity_available ?? 0
  const newOwned       = parseInt(form.quantity_owned) || 0
  const delta          = newOwned - origOwned
  const projectedAvailable = Math.max(0, origAvailable + delta)

  // Derived helpers
  const qty = parseInt(form.quantity_owned) || 0
  const showSerializedWarning = form.tracking_type === 'serialized' && qty > 1
  const trackingHelper = TRACKING_HELPER[form.tracking_type]

  return (
    <PageShell>
      <PageHeader
        title="Edit Inventory Item"
        subtitle={form.name}
        actions={
          <button onClick={() => navigate(`/inventory/${id}`)} className="btn-secondary">
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

        {/* ── A. Operational Details ───────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Operational Details</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Item Name */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Item Name <span className="text-red-500">*</span></label>
              <input type="text" value={form.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('name', e.target.value)}
                className={`form-input ${fieldErrors.name ? 'border-red-400' : ''}`} />
              {fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}
            </div>

            {/* SKU */}
            <div className="space-y-1.5">
              <label className="form-label">SKU</label>
              <input type="text" value={form.sku}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('sku', e.target.value)}
                className="form-input" />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="form-label">Category <span className="text-red-500">*</span></label>
              <select value={form.category}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('category', e.target.value)}
                className="form-select">
                {INVENTORY_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
              </select>
              {fieldErrors.category && <p className="text-xs text-red-600">{fieldErrors.category}</p>}
            </div>

            {/* Tracking Type */}
            <div className="space-y-1.5">
              <label className="form-label">Tracking Type</label>
              <select value={form.tracking_type}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('tracking_type', e.target.value)}
                className="form-select">
                <option value="bulk">Bulk (count-based)</option>
                <option value="serialized">Serialized (individual)</option>
                <option value="hybrid">Hybrid (flexible)</option>
              </select>
            </div>

            {/* Rate / Day */}
            <div className="space-y-1.5">
              <label className="form-label">Rate / Day ($) <span className="text-red-500">*</span></label>
              <input type="number" min="0" step="0.01" value={form.rental_rate}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('rental_rate', e.target.value)}
                className={`form-input ${fieldErrors.rental_rate ? 'border-red-400' : ''}`} />
              {fieldErrors.rental_rate && <p className="text-xs text-red-600">{fieldErrors.rental_rate}</p>}
            </div>

            {/* Tracking type helper — full row */}
            {trackingHelper && (
              <div className="col-span-2 flex items-start gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-px" />
                <p className="text-xs text-muted-foreground leading-relaxed">{trackingHelper}</p>
              </div>
            )}

            {/* Quantity Owned */}
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

            {/* Storage Location */}
            <div className="space-y-1.5">
              <label className="form-label">Storage Location</label>
              <input type="text" value={form.warehouse_location}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('warehouse_location', e.target.value)}
                placeholder="Bay A" className="form-input" />
            </div>

            {/* Serialized + large quantity soft warning */}
            {showSerializedWarning && (
              <div className="col-span-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0 mt-px" />
                <p className="text-xs text-amber-700 leading-relaxed">
                  Serialized inventory tracks individual assets separately. Large quantities are usually better suited for Bulk or Hybrid tracking.
                </p>
              </div>
            )}

            {/* Description */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Description</label>
              <textarea value={form.description}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('description', e.target.value)}
                placeholder="Optional notes about this item…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        {/* ── B. Financial & Depreciation ──────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Financial & Depreciation</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Optional — used for book value estimates and asset management. Not tax/accounting-grade.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">

            {/* Unit Purchase Cost */}
            <div className="space-y-1.5">
              <label className="form-label">Unit Purchase Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.unit_purchase_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('unit_purchase_cost', e.target.value)}
                placeholder="0.00" className="form-input" />
              <p className="text-xs text-muted-foreground">Per-item acquisition cost used for valuation and depreciation estimates.</p>
            </div>

            {/* Replacement Cost */}
            <div className="space-y-1.5">
              <label className="form-label">Replacement Cost ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_cost}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('replacement_cost', e.target.value)}
                className="form-input" />
            </div>

            {/* Purchase Date */}
            <div className="space-y-1.5">
              <label className="form-label">Purchase Date</label>
              <input type="date" value={form.purchase_date}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('purchase_date', e.target.value)}
                className="form-input" />
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <label className="form-label">Vendor / Supplier</label>
              <input type="text" value={form.vendor_name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('vendor_name', e.target.value)}
                placeholder="ABC Rentals Supply Co." className="form-input" />
            </div>

            {/* Depreciation Method */}
            <div className="space-y-1.5">
              <label className="form-label">Depreciation Method</label>
              <select value={form.depreciation_method}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => patch('depreciation_method', e.target.value)}
                className="form-select">
                <option value="none">None (no depreciation)</option>
                <option value="straight_line">Straight-line</option>
              </select>
            </div>

            {form.depreciation_method === 'straight_line' && (
              <>
                <div className="space-y-1.5">
                  <label className="form-label">Useful Life (months)</label>
                  <input type="number" min="1" value={form.expected_lifespan_months}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => patch('expected_lifespan_months', e.target.value)}
                    placeholder="60"
                    className={`form-input ${fieldErrors.expected_lifespan_months ? 'border-red-400' : ''}`} />
                  {fieldErrors.expected_lifespan_months && (
                    <p className="text-xs text-red-600">{fieldErrors.expected_lifespan_months}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="form-label">Residual Value ($)</label>
                  <input type="number" min="0" step="0.01" value={form.residual_value}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => patch('residual_value', e.target.value)}
                    placeholder="0.00" className="form-input" />
                  <p className="text-xs text-muted-foreground">Book value floor — depreciation stops here.</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── C. Risk & Recovery ───────────────────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Risk & Recovery</h3>
          <div className="grid grid-cols-2 gap-4">

            {/* Default Damage Fee */}
            <div className="space-y-1.5">
              <label className="form-label">Default Damage Fee ($)</label>
              <input type="number" min="0" step="0.01" value={form.damage_fee_default}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('damage_fee_default', e.target.value)}
                placeholder="0.00" className="form-input" />
            </div>

            {/* Customer Replacement Charge */}
            <div className="space-y-1.5">
              <label className="form-label">Customer Replacement Charge ($)</label>
              <input type="number" min="0" step="0.01" value={form.replacement_fee_default}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('replacement_fee_default', e.target.value)}
                placeholder="0.00" className="form-input" />
            </div>

            {/* Reorder Point */}
            <div className="space-y-1.5">
              <label className="form-label">Reorder Point</label>
              <input type="number" min="0" value={form.reorder_point}
                onChange={(e: ChangeEvent<HTMLInputElement>) => patch('reorder_point', e.target.value)}
                placeholder="e.g. 5"
                className={`form-input ${fieldErrors.reorder_point ? 'border-red-400' : ''}`} />
              {fieldErrors.reorder_point && <p className="text-xs text-red-600">{fieldErrors.reorder_point}</p>}
              <p className="text-xs text-muted-foreground">
                When available quantity drops below this level, low-stock alerts will appear on the dashboard and reports.
              </p>
            </div>

            {/* Condition Notes */}
            <div className="col-span-2 space-y-1.5">
              <label className="form-label">Condition Notes</label>
              <textarea value={form.condition_notes}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => patch('condition_notes', e.target.value)}
                placeholder="Current condition, known wear, maintenance history…"
                className="form-input min-h-[60px] resize-y" />
            </div>
          </div>
        </div>

        <div className="flex justify-between">
          <button onClick={() => navigate(`/inventory/${id}`)} className="btn-secondary" disabled={saving}>Cancel</button>
          <button onClick={save} className="btn-primary" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </PageShell>
  )
}
